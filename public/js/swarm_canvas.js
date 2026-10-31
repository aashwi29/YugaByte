/**
 * Live Swarm Canvas Engine (B4 Hard Requirement)
 * Visualizes Persons <-> AI Agents <-> Meko Datapacks
 * Renders real moving edges for every Meko MCP tool invocation
 */

class SwarmCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.nodes = new Map();
    this.links = [];
    this.pulseWaves = [];
    this.animFrameId = null;

    this.initNodes();
    this.setupResize();
    this.startLoop();
  }

  initNodes() {
    // 1. Persons (Left Column)
    this.addNode('person_riya', {
      label: 'Riya Patel',
      role: 'Student (Block B, 204)',
      type: 'person',
      icon: '🎓',
      col: 0.12,
      row: 0.2
    });
    this.addNode('person_arjun', {
      label: 'Arjun Sen',
      role: 'Student (Block B, 212)',
      type: 'person',
      icon: '🎓',
      col: 0.12,
      row: 0.38
    });
    this.addNode('person_ramesh', {
      label: 'Caretaker Ramesh',
      role: 'Hostel Maintenance Head',
      type: 'person',
      icon: '🛠️',
      col: 0.12,
      row: 0.58
    });
    this.addNode('person_suresh', {
      label: 'Suresh Kumar',
      role: 'Electrician Technician',
      type: 'person',
      icon: '⚡',
      col: 0.12,
      row: 0.74
    });
    this.addNode('person_dean', {
      label: 'Dr. Sharma',
      role: 'Dean Student Affairs',
      type: 'person',
      icon: '🏛️',
      col: 0.12,
      row: 0.9
    });

    // 2. AI Agents (Center Column)
    this.addNode('agent_intake', {
      label: 'Intake Agent',
      role: 'NLP & Ticket Dedupe',
      type: 'agent',
      icon: '🤖',
      col: 0.46,
      row: 0.2
    });
    this.addNode('agent_electricity', {
      label: 'Dept Electricity Agent',
      role: 'Diagnostics & Load ETA',
      type: 'agent',
      icon: '⚡',
      col: 0.46,
      row: 0.38
    });
    this.addNode('agent_mess', {
      label: 'Dept Mess Agent',
      role: 'Boiler & Utilities',
      type: 'agent',
      icon: '🍲',
      col: 0.46,
      row: 0.54
    });
    this.addNode('agent_conflict', {
      label: 'Conflict Agent',
      role: 'Cross-Datapack Auditor',
      type: 'agent',
      icon: '⚠️',
      col: 0.46,
      row: 0.7
    });
    this.addNode('agent_knowledge', {
      label: 'Knowledge Keeper',
      role: 'Lesson Synthesizer',
      type: 'agent',
      icon: '🧠',
      col: 0.46,
      row: 0.84
    });

    // 3. Meko Datapacks (Right Column)
    this.addNode('dp_student_riya', {
      label: 'student-riya-private',
      role: 'Encrypted Student Store',
      type: 'datapack',
      icon: '🔒',
      col: 0.84,
      row: 0.2
    });
    this.addNode('dp_student_arjun', {
      label: 'student-arjun-private',
      role: 'Encrypted Student Store',
      type: 'datapack',
      icon: '🔒',
      col: 0.84,
      row: 0.35
    });
    this.addNode('dp_electricity', {
      label: 'dept-electricity',
      role: 'Repairs & Outages',
      type: 'datapack',
      icon: '⚡',
      col: 0.84,
      row: 0.52
    });
    this.addNode('dp_mess', {
      label: 'dept-mess',
      role: 'Mess Utility Scopes',
      type: 'datapack',
      icon: '🍲',
      col: 0.84,
      row: 0.68
    });
    this.addNode('dp_canon', {
      label: 'campus-canon',
      role: 'Verified Institutional Memory',
      type: 'datapack',
      icon: '🌟',
      col: 0.84,
      row: 0.86,
      isCanon: true
    });

    // Baseline Links
    this.links = [
      { from: 'person_riya', to: 'agent_intake' },
      { from: 'person_arjun', to: 'agent_intake' },
      { from: 'agent_intake', to: 'dp_student_riya' },
      { from: 'agent_intake', to: 'dp_student_arjun' },
      { from: 'agent_intake', to: 'agent_electricity' },
      { from: 'agent_electricity', to: 'dp_electricity' },
      { from: 'agent_electricity', to: 'dp_canon' },
      { from: 'agent_conflict', to: 'dp_electricity' },
      { from: 'agent_conflict', to: 'dp_mess' },
      { from: 'agent_conflict', to: 'person_ramesh' },
      { from: 'person_ramesh', to: 'agent_knowledge' },
      { from: 'agent_knowledge', to: 'dp_canon' },
      { from: 'person_dean', to: 'dp_canon' }
    ];
  }

  addNode(id, props) {
    this.nodes.set(id, {
      id,
      ...props,
      x: 0,
      y: 0,
      radius: props.type === 'datapack' ? 24 : 20,
      highlightTimer: 0
    });
  }

  setupResize() {
    const resize = () => {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.width = this.canvas.width = rect.width;
      this.height = this.canvas.height = rect.height;
      this.updateNodePositions();
    };
    window.addEventListener('resize', resize);
    setTimeout(resize, 50);
  }

  updateNodePositions() {
    for (const node of this.nodes.values()) {
      node.x = this.width * node.col;
      node.y = this.height * node.row;
    }
  }

  /**
   * Trigger moving particle edge for a real Meko tool call
   */
  triggerMekoCall(call) {
    const { agent, datapack, tool, label, payload_summary } = call;

    // Resolve source and target node IDs
    let sourceId = 'agent_intake';
    if (agent.includes('electricity')) sourceId = 'agent_electricity';
    else if (agent.includes('mess')) sourceId = 'agent_mess';
    else if (agent.includes('conflict')) sourceId = 'agent_conflict';
    else if (agent.includes('knowledge')) sourceId = 'agent_knowledge';
    else if (agent.includes('dean')) sourceId = 'person_dean';

    let targetId = 'dp_electricity';
    if (datapack.includes('riya')) targetId = 'dp_student_riya';
    else if (datapack.includes('arjun')) targetId = 'dp_student_arjun';
    else if (datapack.includes('mess')) targetId = 'dp_mess';
    else if (datapack.includes('canon')) targetId = 'dp_canon';

    // If tool is recall/search, particle flows from Datapack -> Agent
    if (tool === 'memory_search' || tool === 'knowledgebase_search') {
      const tmp = sourceId;
      sourceId = targetId;
      targetId = tmp;
    }

    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (source && target) {
      // Color by label
      let color = '#10b981'; // written
      if (label === 'recalled') color = '#06b6d4';
      else if (label === 'shared') color = '#f59e0b';
      else if (label === 'promoted') color = '#a855f7';

      this.particles.push({
        x: source.x,
        y: source.y,
        startX: source.x,
        startY: source.y,
        endX: target.x,
        endY: target.y,
        progress: 0,
        speed: 0.02,
        color,
        tool,
        label,
        summary: payload_summary,
        targetNode: target
      });

      // Highlight target node
      target.highlightTimer = 40;
    }
  }

  startLoop() {
    const render = () => {
      this.draw();
      this.animFrameId = requestAnimationFrame(render);
    };
    render();
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw static background links
    this.ctx.lineWidth = 1.5;
    for (const link of this.links) {
      const src = this.nodes.get(link.from);
      const tgt = this.nodes.get(link.to);
      if (src && tgt) {
        this.ctx.beginPath();
        this.ctx.moveTo(src.x, src.y);
        this.ctx.lineTo(tgt.x, tgt.y);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        this.ctx.stroke();
      }
    }

    // 2. Draw Moving Meko Edge Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.progress += p.speed;

      // Current coordinates
      p.x = p.startX + (p.endX - p.startX) * p.progress;
      p.y = p.startY + (p.endY - p.startY) * p.progress;

      // Draw glowing particle line tail
      this.ctx.beginPath();
      this.ctx.moveTo(p.startX + (p.endX - p.startX) * Math.max(0, p.progress - 0.25), p.startY + (p.endY - p.startY) * Math.max(0, p.progress - 0.25));
      this.ctx.lineTo(p.x, p.y);
      this.ctx.strokeStyle = p.color;
      this.ctx.lineWidth = 3;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 10;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;

      // Draw particle head
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      this.ctx.fillStyle = '#fff';
      this.ctx.fill();

      // Tool floating badge
      this.ctx.font = '10px "JetBrains Mono", monospace';
      this.ctx.fillStyle = p.color;
      this.ctx.fillText(p.tool, p.x + 8, p.y - 8);

      // Finish condition
      if (p.progress >= 1) {
        // Spawn radial shockwave on target
        this.pulseWaves.push({
          x: p.endX,
          y: p.endY,
          radius: 10,
          maxRadius: 36,
          color: p.color,
          alpha: 1
        });
        this.particles.splice(i, 1);
      }
    }

    // 3. Draw shockwave pulses
    for (let i = this.pulseWaves.length - 1; i >= 0; i--) {
      const wave = this.pulseWaves[i];
      wave.radius += 1.2;
      wave.alpha -= 0.035;

      this.ctx.beginPath();
      this.ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = wave.color;
      this.ctx.globalAlpha = Math.max(0, wave.alpha);
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      this.ctx.globalAlpha = 1.0;

      if (wave.alpha <= 0) {
        this.pulseWaves.splice(i, 1);
      }
    }

    // 4. Draw Nodes
    for (const node of this.nodes.values()) {
      this.drawNode(node);
    }
  }

  drawNode(node) {
    const { x, y, radius, type, icon, label, role, isCanon, highlightTimer } = node;

    // Node outer halo on highlight
    if (highlightTimer > 0) {
      node.highlightTimer--;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
      this.ctx.fillStyle = isCanon ? 'rgba(168, 85, 247, 0.3)' : 'rgba(99, 102, 241, 0.25)';
      this.ctx.fill();
    }

    // Base circle
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (isCanon) {
      this.ctx.fillStyle = '#1e1b4b';
      this.ctx.strokeStyle = '#a855f7';
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowColor = '#a855f7';
      this.ctx.shadowBlur = 12;
    } else if (type === 'datapack') {
      this.ctx.fillStyle = '#0f172a';
      this.ctx.strokeStyle = '#06b6d4';
      this.ctx.lineWidth = 2;
    } else if (type === 'agent') {
      this.ctx.fillStyle = '#18181b';
      this.ctx.strokeStyle = '#6366f1';
      this.ctx.lineWidth = 2;
    } else {
      this.ctx.fillStyle = '#111827';
      this.ctx.strokeStyle = '#374151';
      this.ctx.lineWidth = 1.5;
    }

    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    // Icon
    this.ctx.font = '14px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(icon, x, y);

    // Label
    this.ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText(label, x, y + radius + 14);

    // Role
    this.ctx.font = '9px "Plus Jakarta Sans", sans-serif';
    this.ctx.fillStyle = '#9ca3af';
    this.ctx.fillText(role, x, y + radius + 26);
  }
}

window.SwarmCanvas = SwarmCanvas;
