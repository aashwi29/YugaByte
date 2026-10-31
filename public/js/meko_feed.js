/**
 * Real-time Meko Stream Handler
 * Connects to SSE endpoint and pipes live calls to the UI and Swarm Canvas
 */

class MekoFeed {
  constructor(swarmCanvas) {
    this.canvas = swarmCanvas;
    this.container = document.getElementById('live-feed-container');
    this.countBadge = document.getElementById('live-stream-count');
    this.totalCallsEl = document.getElementById('call-count');
    this.eventCount = 0;
    this.initStream();
  }

  initStream() {
    try {
      this.evtSource = new EventSource('/api/stream');

      this.evtSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'meko_call' && payload.entry) {
            this.handleCall(payload.entry);
          }
        } catch (err) {
          console.warn('Failed parsing SSE payload:', err);
        }
      };

      this.evtSource.onerror = () => {
        if (this.countBadge) {
          this.countBadge.innerText = 'Reconnecting...';
        }
      };

      this.evtSource.onopen = () => {
        if (this.countBadge) {
          this.countBadge.innerText = 'Connected Live';
        }
      };
    } catch (err) {
      console.error('SSE initialization error:', err);
    }
  }

  handleCall(entry) {
    this.eventCount++;
    if (this.totalCallsEl) {
      const current = parseInt(this.totalCallsEl.innerText || '0', 10);
      this.totalCallsEl.innerText = current + 1;
    }

    // 1. Pipe into Swarm visual graph
    if (this.canvas) {
      this.canvas.triggerMekoCall(entry);
    }

    // 2. Render live drawer feed entry
    if (this.container) {
      const timeStr = entry.ts ? new Date(entry.ts).toLocaleTimeString() : 'now';
      const el = document.createElement('div');
      el.className = `feed-entry tool-${entry.tool}`;

      // Label badge
      let badgeClass = 'badge-emerald';
      if (entry.label === 'recalled') badgeClass = 'badge-cyan';
      else if (entry.label === 'shared') badgeClass = 'badge-amber';
      else if (entry.label === 'promoted') badgeClass = 'badge-purple';

      el.innerHTML = `
        <span class="feed-time">${timeStr}</span>
        <span class="badge ${badgeClass}">${entry.tool}</span>
        <span class="feed-agent">${entry.agent}</span>
        <span class="text-dim">→</span>
        <span class="feed-dp">${entry.datapack}</span>
        <span class="feed-text" title="${entry.payload_summary}">"${entry.payload_summary}"</span>
        <span class="font-mono text-dim">${entry.result_id || ''}</span>
      `;

      this.container.prepend(el);

      // Keep maximum 40 in live drawer
      while (this.container.children.length > 40) {
        this.container.removeChild(this.container.lastChild);
      }
    }
  }
}

window.MekoFeed = MekoFeed;
