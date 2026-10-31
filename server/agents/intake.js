import crypto from 'node:crypto';

export class IntakeAgent {
  constructor(mekoEngine) {
    this.meko = mekoEngine;
    this.name = 'intake';
  }

  /**
   * Process incoming grievance from student in natural language
   * Follows brief: memory_add → memory_search (dedupe) → memory_add (merged/triaged ticket)
   */
  async processGrievance({ student_id, student_name, room, text, timestamp }) {
    const studentDatapack = `student-${student_id}-private`;

    // 1. memory_add: Store raw student grievance in private student datapack (B5: honest & private)
    const rawMem = await this.meko.memory_add({
      agent: this.name,
      datapack_id: studentDatapack,
      content: text,
      metadata: {
        type: 'raw_complaint',
        student_id,
        student_name,
        room,
        submitted_at: timestamp || new Date().toISOString()
      },
      label: 'written'
    });

    // 2. Extract key domain signals (location, equipment, symptoms)
    const domainKeywords = this.extractDomainKeywords(text, room);

    // 3. memory_search: Deduplicate against open department tickets and active complaints
    const dedupeSearch = await this.meko.memory_search({
      agent: this.name,
      datapack_id: 'dept-electricity',
      query: `${domainKeywords.location} ${domainKeywords.appliance} ${domainKeywords.symptom}`,
      limit: 3
    });

    // Determine if this matches an already reported / active incident
    let dedupeMatch = null;
    if (dedupeSearch.results && dedupeSearch.results.length > 0) {
      const best = dedupeSearch.results[0];
      if (best.relevance > 0.4 && (best.metadata?.type === 'active_incident' || best.metadata?.type === 'open_ticket')) {
        dedupeMatch = best;
      }
    }

    const ticketId = dedupeMatch ? (dedupeMatch.data?.incident_id || dedupeMatch.memory_id) : `TKT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const isMerged = !!dedupeMatch;

    // 4. memory_add: Write triaged/merged ticket status back to student datapack so student sees where it stands
    const statusPayload = {
      ticket_id: ticketId,
      status: isMerged ? 'merged_with_cluster' : 'registered',
      category: domainKeywords.category,
      location: domainKeywords.location,
      appliance: domainKeywords.appliance,
      is_clustered: isMerged,
      cluster_info: isMerged ? `Clustered with active issue ${ticketId} (multiple student reports consolidated)` : 'Unique incident registered',
      student_visible_message: isMerged 
        ? `We recognized your issue as part of an existing report for ${domainKeywords.location} ${domainKeywords.appliance}. You do not need to resubmit.`
        : `Your complaint has been logged and routed to the ${domainKeywords.category} maintenance cell.`
    };

    await this.meko.memory_add({
      agent: this.name,
      datapack_id: studentDatapack,
      content: `STATUS UPDATE for [${ticketId}]: ${statusPayload.student_visible_message}`,
      metadata: {
        type: 'ticket_status',
        ticket_id: ticketId,
        student_id,
        category: domainKeywords.category,
        is_clustered: isMerged
      },
      label: 'written'
    });

    return {
      success: true,
      ticket_id: ticketId,
      student_id,
      student_name,
      datapack_id: studentDatapack,
      raw_memory_id: rawMem.memory_id,
      is_merged: isMerged,
      category: domainKeywords.category,
      location: domainKeywords.location,
      appliance: domainKeywords.appliance,
      symptom: domainKeywords.symptom,
      text,
      status_info: statusPayload
    };
  }

  extractDomainKeywords(text, room = '') {
    const lower = text.toLowerCase();
    
    // Category detection
    let category = 'maintenance';
    if (/geyser|heater|water hot|cold water|switch|mcb|light|power|flicker|spark|breaker/i.test(lower)) {
      category = 'electricity';
    } else if (/food|mess|rotti|meal|water filter|tiffin|catering/i.test(lower)) {
      category = 'mess';
    }

    // Appliance detection
    let appliance = 'general';
    if (/geyser|water heater|heater/i.test(lower)) appliance = 'geyser';
    else if (/wifi|router|internet/i.test(lower)) appliance = 'router';
    else if (/light|bulb|tube/i.test(lower)) appliance = 'lighting';

    // Location
    let location = 'Block B Floor 2';
    if (/floor 1|1st floor/i.test(lower)) location = 'Block B Floor 1';
    else if (/floor 2|2nd floor/i.test(lower)) location = 'Block B Floor 2';
    else if (/floor 3|3rd floor/i.test(lower)) location = 'Block B Floor 3';
    else if (room) location = `Block B Room ${room}`;

    // Symptom
    let symptom = 'malfunction';
    if (/cold|lukewarm|no hot water/i.test(lower)) symptom = 'cold water / trips breaker';
    if (/tripping|flicker|spark/i.test(lower)) symptom += ' / electrical trip';

    return { category, appliance, location, symptom };
  }
}
