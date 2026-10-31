import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

export class MekoEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logsPath = options.logsPath || path.resolve('logs/meko_calls.jsonl');
    this.dataPath = options.dataPath || path.resolve('data/meko_store.json');
    this.memoryStore = new Map(); // datapack_id -> Array<MemoryRecord>
    this.ensureDirs();
    this.loadStore();
  }

  ensureDirs() {
    const logDir = path.dirname(this.logsPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const dataDir = path.dirname(this.dataPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  loadStore() {
    if (fs.existsSync(this.dataPath)) {
      try {
        const raw = fs.readFileSync(this.dataPath, 'utf-8');
        const parsed = JSON.parse(raw);
        for (const [dp, items] of Object.entries(parsed)) {
          this.memoryStore.set(dp, items);
        }
      } catch (err) {
        console.warn('Failed to parse meko_store.json, starting with empty store:', err.message);
      }
    }
    // Ensure default datapacks exist
    const defaultDatapacks = ['campus-canon', 'dept-electricity', 'dept-mess'];
    for (const dp of defaultDatapacks) {
      if (!this.memoryStore.has(dp)) {
        this.memoryStore.set(dp, []);
      }
    }
  }

  saveStore() {
    try {
      const obj = {};
      for (const [dp, items] of this.memoryStore.entries()) {
        obj[dp] = items;
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving meko_store.json:', err);
    }
  }

  /**
   * Log an MCP call to logs/meko_calls.jsonl and emit event
   */
  logCall({ agent, datapack, tool, label, payload_summary, result_id }) {
    const entry = {
      ts: new Date().toISOString(),
      agent,
      datapack,
      tool,
      label, // "written" | "recalled" | "shared" | "promoted"
      payload_summary,
      result_id: result_id || `res_${crypto.randomBytes(4).toString('hex')}`
    };

    const line = JSON.stringify(entry) + '\n';
    try {
      fs.appendFileSync(this.logsPath, line, 'utf-8');
    } catch (err) {
      console.error('Failed appending to meko_calls.jsonl:', err);
    }

    // Emit live event for Swarm View streaming
    this.emit('meko_call', entry);
    return entry;
  }

  /**
   * Meko tool: memory_add
   * Adds memory to a specific datapack
   */
  async memory_add({ agent, datapack_id, content, metadata = {}, label = 'written' }) {
    if (!datapack_id) throw new Error('datapack_id is required');
    if (!agent) throw new Error('agent is required');

    // Rule: campus-canon cannot be written directly via memory_add
    if (datapack_id === 'campus-canon') {
      throw new Error('Direct write to campus-canon is prohibited. Use memory_promote with human approval.');
    }

    if (!this.memoryStore.has(datapack_id)) {
      this.memoryStore.set(datapack_id, []);
    }

    const memory_id = `mem_${crypto.randomBytes(4).toString('hex')}`;
    const textContent = typeof content === 'string' ? content : (content.text || JSON.stringify(content));
    
    const record = {
      memory_id,
      datapack_id,
      content: textContent,
      data: typeof content === 'object' ? content : {},
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
        created_by: agent
      }
    };

    this.memoryStore.get(datapack_id).push(record);
    this.saveStore();

    const summary = textContent.length > 80 ? textContent.slice(0, 77) + '...' : textContent;
    this.logCall({
      agent,
      datapack: datapack_id,
      tool: 'memory_add',
      label,
      payload_summary: summary,
      result_id: memory_id
    });

    return {
      success: true,
      memory_id,
      datapack_id,
      record
    };
  }

  /**
   * Meko tool: memory_search
   * Scans a datapack for relevant memories
   */
  async memory_search({ agent, datapack_id, query, limit = 5, min_score = 0.1 }) {
    if (!datapack_id) throw new Error('datapack_id is required');
    if (!agent) throw new Error('agent is required');

    const items = this.memoryStore.get(datapack_id) || [];
    const queryTokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);

    const scored = items.map(item => {
      const itemText = (item.content + ' ' + JSON.stringify(item.metadata || {})).toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (itemText.includes(token)) {
          matchCount++;
        }
      }
      // Exact substring boost
      let score = queryTokens.length ? matchCount / queryTokens.length : 0;
      if (itemText.includes(query.toLowerCase().trim())) {
        score += 0.5;
      }
      return { item, score };
    });

    const matches = scored
      .filter(s => s.score >= min_score)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({
        memory_id: s.item.memory_id,
        content: s.item.content,
        data: s.item.data,
        metadata: s.item.metadata,
        relevance: parseFloat(s.score.toFixed(2))
      }));

    const summary = `Query: "${query}" -> ${matches.length} matches`;
    this.logCall({
      agent,
      datapack: datapack_id,
      tool: 'memory_search',
      label: 'recalled',
      payload_summary: summary,
      result_id: matches.length > 0 ? matches[0].memory_id : 'no_match'
    });

    return {
      datapack_id,
      query,
      count: matches.length,
      results: matches
    };
  }

  /**
   * Meko tool: memory_promote
   * Promotes a verified memory to campus-canon ONLY with explicit human confirmation
   */
  async memory_promote({ agent, source_datapack_id, memory_id, human_approver, note = '' }) {
    if (!human_approver) {
      throw new Error('B2 Violation: Promotion to campus-canon requires verified human approval (caretaker/warden)');
    }
    if (!source_datapack_id || !memory_id) {
      throw new Error('source_datapack_id and memory_id are required for memory_promote');
    }

    const sourceItems = this.memoryStore.get(source_datapack_id) || [];
    const found = sourceItems.find(m => m.memory_id === memory_id);
    if (!found) {
      throw new Error(`Memory ${memory_id} not found in ${source_datapack_id}`);
    }

    if (!this.memoryStore.has('campus-canon')) {
      this.memoryStore.set('campus-canon', []);
    }

    const canonId = `canon_${crypto.randomBytes(4).toString('hex')}`;
    const promotedRecord = {
      memory_id: canonId,
      original_memory_id: found.memory_id,
      datapack_id: 'campus-canon',
      content: found.content,
      data: found.data,
      metadata: {
        ...found.metadata,
        promoted_from: source_datapack_id,
        promoted_at: new Date().toISOString(),
        promoted_by_agent: agent,
        human_approver,
        note,
        verified: true
      }
    };

    this.memoryStore.get('campus-canon').push(promotedRecord);
    this.saveStore();

    const summary = `Promoted [${found.memory_id}] by ${human_approver}: "${found.content.slice(0, 50)}..."`;
    this.logCall({
      agent,
      datapack: 'campus-canon',
      tool: 'memory_promote',
      label: 'promoted',
      payload_summary: summary,
      result_id: canonId
    });

    return {
      success: true,
      promoted_id: canonId,
      original_id: found.memory_id,
      human_approver,
      record: promotedRecord
    };
  }

  /**
   * Meko tool: knowledgebase_search
   * Read-only search on campus-canon (used by Dean view & agents for B3 recall)
   */
  async knowledgebase_search({ agent, datapack_id = 'campus-canon', query, limit = 5 }) {
    const items = this.memoryStore.get(datapack_id) || [];
    const queryTokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);

    const scored = items.map(item => {
      const itemText = (item.content + ' ' + JSON.stringify(item.metadata || {})).toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (itemText.includes(token)) matchCount++;
      }
      let score = queryTokens.length ? matchCount / queryTokens.length : 0;
      if (itemText.includes(query.toLowerCase().trim())) score += 0.5;
      return { item, score };
    });

    const matches = scored
      .filter(s => s.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({
        memory_id: s.item.memory_id,
        content: s.item.content,
        metadata: s.item.metadata,
        relevance: parseFloat(s.score.toFixed(2))
      }));

    const summary = `Canon query: "${query}" -> ${matches.length} lessons verified`;
    this.logCall({
      agent,
      datapack: datapack_id,
      tool: 'knowledgebase_search',
      label: 'shared',
      payload_summary: summary,
      result_id: matches.length > 0 ? matches[0].memory_id : 'canon_none'
    });

    return {
      datapack_id,
      query,
      count: matches.length,
      results: matches
    };
  }

  /**
   * Get all calls from logs/meko_calls.jsonl
   */
  getCallLogs(limit = 100) {
    if (!fs.existsSync(this.logsPath)) return [];
    try {
      const lines = fs.readFileSync(this.logsPath, 'utf-8').trim().split('\n').filter(Boolean);
      const parsed = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
      return parsed.slice(-limit).reverse();
    } catch (err) {
      console.error('Error reading meko_calls.jsonl:', err);
      return [];
    }
  }

  /**
   * Clear all memories and logs for a clean demonstration run
   */
  resetAll() {
    this.memoryStore.clear();
    const defaultDatapacks = ['campus-canon', 'dept-electricity', 'dept-mess'];
    for (const dp of defaultDatapacks) {
      this.memoryStore.set(dp, []);
    }
    this.saveStore();
    fs.writeFileSync(this.logsPath, '', 'utf-8');
    this.emit('reset');
  }

  /**
   * Seed baseline departmental data (e.g. planned maintenance, baseline knowledge)
   */
  async seedBaseline() {
    // 1. Dept Electricity schedule: Planned power shutdown
    await this.memory_add({
      agent: 'electricity',
      datapack_id: 'dept-electricity',
      content: 'SCHEDULED OUTAGE: Substation 2 scheduled maintenance shutdown Nov 2, 14:00 - 17:00 IST. Affects Hostel Block B and C west wings. No heavy load or geyser testing permitted.',
      metadata: {
        type: 'maintenance_schedule',
        block: 'Block B',
        window: '14:00 - 17:00',
        status: 'active'
      },
      label: 'written'
    });

    // 2. Dept Electricity equipment specs
    await this.memory_add({
      agent: 'electricity',
      datapack_id: 'dept-electricity',
      content: 'EQUIPMENT SPEC: Hostel Block B Floor 2 washroom runs a 25L Venus 2000W geyser connected to distribution board DB-2B.',
      metadata: {
        type: 'equipment_spec',
        location: 'Block B Floor 2'
      },
      label: 'written'
    });

    // 3. Dept Mess baseline
    await this.memory_add({
      agent: 'mess',
      datapack_id: 'dept-mess',
      content: 'MESS LOG: Commercial steam boiler inspection passed. Hot water supply for hostel kitchens operating normally.',
      metadata: {
        type: 'inspection',
        facility: 'Central Mess'
      },
      label: 'written'
    });

    return { seeded: true };
  }
}
