/**
 * Campus Grievance Swarm - Main Frontend Application
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Swarm Visual Canvas & Live Feed
  const swarmCanvas = new SwarmCanvas('swarmCanvas');
  const mekoFeed = new MekoFeed(swarmCanvas);

  // Global State
  let activeTickets = [];
  let pendingPromotions = [];
  let selectedTicketId = null;

  // Cache DOM Elements
  const tabButtons = document.querySelectorAll('.nav-pill');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const ticketCountEl = document.getElementById('ticket-count');
  const callCountEl = document.getElementById('call-count');
  const pendingBadgeEl = document.getElementById('pending-badge');

  // 2. Tab Navigation
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active');

      if (targetId === 'tab-logs') loadLogs();
      if (targetId === 'tab-dean') loadDeanView();
      if (targetId === 'tab-caretaker') loadCaretakerData();
    });
  });

  // Dropdown Menu Toggle
  const dropdownBtn = document.getElementById('scenario-dropdown-btn');
  const dropdownMenu = document.getElementById('scenario-menu');
  if (dropdownBtn && dropdownMenu) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('show');
    });
    document.addEventListener('click', () => dropdownMenu.classList.remove('show'));
  }

  // Preset Handlers
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      const personaSelect = document.getElementById('student-persona');
      const locInput = document.getElementById('grievance-location');
      const textInput = document.getElementById('grievance-text');

      if (preset === 'caseA') {
        personaSelect.value = 'riya';
        locInput.value = 'Block B Room 204';
        textInput.value = 'The geyser in the 2nd floor bathroom gives lukewarm water and then the lights flicker and it completely stops heating.';
      } else if (preset === 'caseB') {
        personaSelect.value = 'arjun';
        locInput.value = 'Block B Room 212';
        textInput.value = 'Water heater is totally dead again in 2nd floor washroom, no warm water this morning.';
      } else if (preset === 'mess') {
        personaSelect.value = 'priya';
        locInput.value = 'Central Mess Wash Area';
        textInput.value = 'Hot water supply to central mess dishwashing taps is failing, grease cannot be cleaned from lunch trays.';
      }
    });
  });

  // 3. Student Grievance Submission (B1)
  const grievanceForm = document.getElementById('grievance-form');
  grievanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const student_id = document.getElementById('student-persona').value;
    const student_name = document.getElementById('student-persona').selectedOptions[0].text.split(' (')[0];
    const room = document.getElementById('grievance-location').value;
    const text = document.getElementById('grievance-text').value.trim();
    const useMeko = document.getElementById('student-meko-toggle').checked;

    if (!text) return showToast('Please enter grievance details', 'toast-error');

    showToast('Submitting grievance to Swarm Intake...', 'toast-purple');

    try {
      const res = await fetch('/api/grievance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id, student_name, room, text, useMeko })
      });
      const data = await res.json();
      if (data.success && data.ticket) {
        showToast(`Complaint registered as [${data.ticket.ticket_id}]`, 'toast-success');
        renderStudentStatus(data.ticket);
        await refreshSystemStatus();
      }
    } catch (err) {
      showToast('Error submitting grievance: ' + err.message, 'toast-error');
    }
  });

  function renderStudentStatus(ticket) {
    const container = document.getElementById('student-status-view');
    const isConflict = ticket.conflicts && ticket.conflicts.has_conflict;

    container.innerHTML = `
      <div class="status-card-inner">
        <div class="status-step">
          <div class="status-step-icon">1</div>
          <div class="status-step-content">
            <strong>Ticket ID: <span class="text-cyan font-mono">${ticket.ticket_id}</span></strong>
            <p>Logged in private scope <code>student-${ticket.student_id}-private</code> for ${ticket.student_name}.</p>
          </div>
        </div>

        <div class="status-step">
          <div class="status-step-icon">2</div>
          <div class="status-step-content">
            <strong>Status & Routing:</strong>
            <p class="text-emerald font-bold">${ticket.status.toUpperCase()}</p>
            <p>${ticket.intake.status_info.student_visible_message}</p>
          </div>
        </div>

        <div class="status-step">
          <div class="status-step-icon">3</div>
          <div class="status-step-content">
            <strong>Believable ETA:</strong>
            <p class="text-amber font-mono font-bold">${ticket.scheduling.eta}</p>
            <p>${ticket.scheduling.diagnostic_advice}</p>
          </div>
        </div>

        ${isConflict ? `
        <div class="status-step">
          <div class="status-step-icon" style="border-color: var(--amber); color: var(--amber);">⚠️</div>
          <div class="status-step-content">
            <strong class="text-amber">Cross-Department Coordination Alert:</strong>
            <p>${ticket.conflicts.conflicts[0].description}</p>
            <p class="text-muted">Caretaker is adjusting schedule to prevent wasted technician visit.</p>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  // 4. Caretaker Console & Queue Management (B2)
  async function loadCaretakerData() {
    try {
      const [tRes, pRes] = await fetchAll(['/api/tickets', '/api/promotions']);
      activeTickets = tRes.tickets || [];
      pendingPromotions = pRes.pending_promotions || [];

      renderCaretakerQueue();
      checkPendingPromotionsBanner();
    } catch (err) {
      console.error('Error loading caretaker data:', err);
    }
  }

  function renderCaretakerQueue() {
    const list = document.getElementById('caretaker-ticket-list');
    const countBadge = document.getElementById('active-queue-count');
    countBadge.innerText = `${activeTickets.length} tickets`;

    if (!activeTickets.length) {
      list.innerHTML = `<div class="empty-state"><p>No active grievances in queue.</p></div>`;
      return;
    }

    list.innerHTML = activeTickets.map(t => {
      const isResolved = t.is_resolved;
      const hasConflict = t.conflicts && t.conflicts.has_conflict;
      const statusBadge = isResolved 
        ? `<span class="badge badge-emerald">RESOLVED</span>`
        : (hasConflict ? `<span class="badge badge-amber">CONFLICT</span>` : `<span class="badge badge-blue">DISPATCHED</span>`);

      return `
        <div class="ticket-item ${selectedTicketId === t.ticket_id ? 'active' : ''}" data-id="${t.ticket_id}">
          <div class="ticket-top">
            <span class="ticket-id text-cyan">${t.ticket_id}</span>
            ${statusBadge}
          </div>
          <div class="ticket-text">${t.text.slice(0, 90)}...</div>
          <div class="d-flex justify-between align-center mt-3 text-dim" style="font-size: 0.75rem;">
            <span>${t.student_name} (${t.room})</span>
            <span class="font-mono text-amber">${t.scheduling?.eta ? t.scheduling.eta.split(' (')[0] : ''}</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach click handlers
    list.querySelectorAll('.ticket-item').forEach(el => {
      el.addEventListener('click', () => {
        selectedTicketId = el.dataset.id;
        renderCaretakerQueue();
        renderCaretakerActionPanel();
      });
    });

    if (!selectedTicketId && activeTickets.length > 0) {
      selectedTicketId = activeTickets[0].ticket_id;
      renderCaretakerActionPanel();
    }
  }

  function renderCaretakerActionPanel() {
    const panel = document.getElementById('caretaker-action-panel');
    const badge = document.getElementById('selected-ticket-badge');
    const ticket = activeTickets.find(t => t.ticket_id === selectedTicketId);

    if (!ticket) {
      panel.innerHTML = `<div class="empty-state"><p>Select a ticket from the queue.</p></div>`;
      badge.innerText = 'Select a ticket';
      return;
    }

    badge.innerText = ticket.ticket_id;
    const hasConflict = ticket.conflicts && ticket.conflicts.has_conflict;

    panel.innerHTML = `
      <div style="padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
        <div>
          <span class="text-dim" style="font-size: 0.75rem;">STUDENT COMPLAINT</span>
          <p style="font-size: 0.9rem; margin-top: 0.25rem;">"${ticket.text}"</p>
          <div class="text-dim" style="font-size: 0.78rem; margin-top: 0.25rem;">
            ${ticket.student_name} · ${ticket.location} · Logged: ${new Date(ticket.created_at).toLocaleTimeString()}
          </div>
        </div>

        ${hasConflict ? `
        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid var(--amber); border-radius: 6px; padding: 0.75rem;">
          <strong class="text-amber">⚠️ Cross-Datapack Contradiction Flagged:</strong>
          <p style="font-size: 0.82rem; margin-top: 0.25rem;">${ticket.conflicts.conflicts[0].description}</p>
          <p class="text-dim" style="font-size: 0.78rem; margin-top: 0.25rem;">Recommendation: ${ticket.conflicts.conflicts[0].recommended_human_action}</p>
        </div>
        ` : ''}

        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem;">
          <strong class="text-cyan">Department Diagnostic Plan:</strong>
          <p style="font-size: 0.85rem; margin-top: 0.25rem;">${ticket.scheduling.diagnostic_advice}</p>
          <div style="display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.8rem;">
            <span>Technician: <strong class="text-muted">Suresh Kumar</strong></span>
            <span>ETA: <strong class="text-emerald font-mono">${ticket.scheduling.eta}</strong></span>
          </div>
        </div>

        ${ticket.is_resolved ? `
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid var(--emerald); border-radius: 6px; padding: 0.75rem;">
          <strong class="text-emerald">✔ Resolved by ${ticket.resolution.caretaker}:</strong>
          <p style="font-size: 0.85rem; margin-top: 0.25rem;"><strong>Diagnosis:</strong> ${ticket.resolution.diagnosis}</p>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.25rem;"><strong>Notes:</strong> ${ticket.resolution.notes}</p>
        </div>
        ` : `
        <form id="resolve-form" style="padding: 0;">
          <div class="form-group">
            <label>Physical Inspection Findings / Root Cause</label>
            <input type="text" id="res-diagnosis" class="form-control" value="Phase 1 radiator load was tripping 16A breaker. Switched geyser circuit to Phase 2 on subpanel DB-2B.">
          </div>
          <div class="form-group">
            <label>Resolution Sign-off Notes</label>
            <input type="text" id="res-notes" class="form-control" value="Hot water restored at 65°C. Breaker holding steady under morning peak load.">
          </div>
          <button type="submit" class="btn btn-emerald" style="width: 100%;">
            ✔ Mark Resolved & Synthesize Canon Lesson
          </button>
        </form>
        `}
      </div>
    `;

    const resForm = document.getElementById('resolve-form');
    if (resForm) {
      resForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const diagnosis = document.getElementById('res-diagnosis').value;
        const resolution_notes = document.getElementById('res-notes').value;

        try {
          const res = await fetch('/api/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticket_id: selectedTicketId,
              caretaker_name: 'Caretaker Ramesh',
              technician: 'Suresh Kumar',
              diagnosis,
              resolution_notes
            })
          });
          const data = await res.json();
          if (data.success) {
            showToast('Ticket marked resolved. Knowledge Keeper synthesized lesson!', 'toast-success');
            await loadCaretakerData();
            checkPendingPromotionsBanner();
          }
        } catch (err) {
          showToast('Error resolving: ' + err.message, 'toast-error');
        }
      });
    }
  }

  // 5. Human Promotion Approval Flow (Critical B2 & 4.1 Requirement)
  function checkPendingPromotionsBanner() {
    const banner = document.getElementById('pending-promotion-banner');
    if (!banner) return;

    if (pendingPromotions.length > 0) {
      banner.style.display = 'flex';
      if (pendingBadgeEl) {
        pendingBadgeEl.style.display = 'inline-flex';
        pendingBadgeEl.innerText = pendingPromotions.length;
      }
      const p = pendingPromotions[0];
      document.getElementById('pending-banner-text').innerText =
        `Lesson synthesized for [${p.ticket_id}]: "${p.preview.action}". Human approval required to promote to campus-canon.`;
    } else {
      banner.style.display = 'none';
      if (pendingBadgeEl) pendingBadgeEl.style.display = 'none';
    }
  }

  const reviewPromoBtn = document.getElementById('btn-review-promotion');
  const promoModal = document.getElementById('promotion-modal');
  const closeModalBtn = document.getElementById('btn-close-modal');
  const cancelModalBtn = document.getElementById('btn-cancel-modal');
  const confirmPromoteBtn = document.getElementById('btn-confirm-promote');

  if (reviewPromoBtn) {
    reviewPromoBtn.addEventListener('click', () => {
      if (!pendingPromotions.length) return;
      const p = pendingPromotions[0];
      document.getElementById('modal-source-dp').innerText = p.source_datapack;
      document.getElementById('modal-candidate-id').innerText = p.candidate_memory_id;
      document.getElementById('modal-lesson-text').innerText = p.proposed_lesson;
      promoModal.style.display = 'flex';
    });
  }

  const hideModal = () => { if (promoModal) promoModal.style.display = 'none'; };
  if (closeModalBtn) closeModalBtn.addEventListener('click', hideModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', hideModal);

  if (confirmPromoteBtn) {
    confirmPromoteBtn.addEventListener('click', async () => {
      if (!pendingPromotions.length) return;
      const p = pendingPromotions[0];
      const human_approver = document.getElementById('modal-approver-name').value;
      const note = document.getElementById('modal-approval-note').value;

      try {
        const res = await fetch('/api/promote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_memory_id: p.candidate_memory_id,
            human_approver,
            note
          })
        });
        const data = await res.json();
        if (data.success) {
          hideModal();
          showToast(`🌟 Memory promoted to campus-canon by ${human_approver}!`, 'toast-purple');
          await loadCaretakerData();
          checkPendingPromotionsBanner();
          enableStep3Buttons();
        }
      } catch (err) {
        showToast('Promotion failed: ' + err.message, 'toast-error');
      }
    });
  }

  // 6. B3 Step-by-Step Demonstration Walkthrough
  const btnRunStep1 = document.getElementById('btn-run-step1');
  const btnRunStep2 = document.getElementById('btn-run-step2');
  const btnRunStep3On = document.getElementById('btn-run-step3-on');
  const btnRunStep3Off = document.getElementById('btn-run-step3-off');

  if (btnRunStep1) {
    btnRunStep1.addEventListener('click', async () => {
      showToast('Running Case A: Student Riya reports geyser tripping...', 'toast-purple');
      const res = await fetch('/api/scenario/case-a', { method: 'POST' });
      const data = await res.json();
      if (data.ticket) {
        selectedTicketId = data.ticket.ticket_id;
        document.getElementById('step1-card').classList.add('active-step');
        btnRunStep2.removeAttribute('disabled');
        showToast(`Case A logged [${data.ticket.ticket_id}]. Resolving & extracting lesson...`, 'toast-success');

        // Automatically resolve and stage candidate lesson
        setTimeout(async () => {
          await fetch('/api/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticket_id: data.ticket.ticket_id,
              caretaker_name: 'Caretaker Ramesh',
              technician: 'Suresh Kumar',
              diagnosis: 'Phase 1 radiator load was tripping 16A breaker. Switched geyser circuit to Phase 2 on subpanel DB-2B.',
              resolution_notes: 'Hot water 65°C verified. Circuit stable under morning load.'
            })
          });
          await loadCaretakerData();
          showToast('Knowledge Keeper generated candidate lesson! Click Step 2 to approve promotion.', 'toast-purple');
        }, 1200);
      }
    });
  }

  if (btnRunStep2) {
    btnRunStep2.addEventListener('click', () => {
      if (reviewPromoBtn) reviewPromoBtn.click();
    });
  }

  function enableStep3Buttons() {
    document.getElementById('step2-card').classList.add('active-step');
    if (btnRunStep3On) btnRunStep3On.removeAttribute('disabled');
    if (btnRunStep3Off) btnRunStep3Off.removeAttribute('disabled');
  }

  if (btnRunStep3On) {
    btnRunStep3On.addEventListener('click', async () => {
      showToast('Running Case B with Meko ON (Learning Campus)...', 'toast-purple');
      const res = await fetch('/api/scenario/case-b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useMeko: true })
      });
      const data = await res.json();
      if (data.ticket) {
        showToast('⚡ Case B recalled verified fix! Solved in 30 minutes!', 'toast-success');
        updateB3Comparison(data.ticket, true);
        await refreshSystemStatus();
      }
    });
  }

  if (btnRunStep3Off) {
    btnRunStep3Off.addEventListener('click', async () => {
      showToast('Running Case B with Meko OFF (Siloed Helpdesk)...', 'toast-error');
      const res = await fetch('/api/scenario/case-b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useMeko: false })
      });
      const data = await res.json();
      if (data.ticket) {
        showToast('❌ Without Meko: 72 hour naive replacement ordered!', 'toast-error');
        updateB3Comparison(data.ticket, false);
        await refreshSystemStatus();
      }
    });
  }

  function updateB3Comparison(ticket, isMekoOn) {
    const target = isMekoOn ? document.getElementById('b3-on-content') : document.getElementById('b3-off-content');
    if (!target) return;

    if (isMekoOn) {
      target.innerHTML = `
        <div class="b3-feature">
          <strong>Institutional Memory:</strong>
          <p class="text-cyan">⚡ Recalled from Campus Canon [${ticket.scheduling.recalled_lesson?.memory_id || 'verified'}]: Phase 1 radiator overload lesson verified from Case A.</p>
        </div>
        <div class="b3-feature">
          <strong>Technician Action Plan:</strong>
          <p>${ticket.scheduling.diagnostic_advice}</p>
        </div>
        <div class="b3-feature">
          <strong>Parts Requisition:</strong>
          <p class="text-emerald">₹0 wasted (Existing breaker panel load balanced)</p>
        </div>
        <div class="b3-feature">
          <strong>Outcome:</strong>
          <p class="text-emerald font-bold">Hot water restored to 2nd floor in 30 minutes! Institutional memory prevented 3 days of delay.</p>
        </div>
      `;
    } else {
      target.innerHTML = `
        <div class="b3-feature">
          <strong>Institutional Memory:</strong>
          <p class="text-muted">❌ None. Department agents operate in isolation. Prior fixes forgotten.</p>
        </div>
        <div class="b3-feature">
          <strong>Technician Action Plan:</strong>
          <p>${ticket.scheduling.diagnostic_advice}</p>
        </div>
        <div class="b3-feature">
          <strong>Parts Requisition:</strong>
          <p class="text-red">₹4,500 needlessly spent on heating coil that wasn't broken.</p>
        </div>
        <div class="b3-feature">
          <strong>Outcome:</strong>
          <p class="text-red font-bold">Students endure 3 days of ice-cold winter showers while waiting for parts shipment.</p>
        </div>
      `;
    }
  }

  // Quick Dropdown Scenarios
  document.getElementById('run-case-a')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (btnRunStep1) btnRunStep1.click();
  });
  document.getElementById('run-case-b-on')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (btnRunStep3On) btnRunStep3On.click();
  });
  document.getElementById('run-case-b-off')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (btnRunStep3Off) btnRunStep3Off.click();
  });

  // 7. Dean View (Reads campus-canon ONLY)
  async function loadDeanView() {
    try {
      const res = await fetch('/api/dean');
      const data = await res.json();

      document.getElementById('canon-record-count').innerText = `${data.verified_records_count} Verified`;
      const canonList = document.getElementById('dean-canon-list');
      const patternsContainer = document.getElementById('dean-patterns-container');

      if (!data.records.length) {
        canonList.innerHTML = `<div class="empty-state"><p>No memories promoted to campus-canon yet. Complete Case A promotion.</p></div>`;
      } else {
        canonList.innerHTML = data.records.map(r => `
          <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--purple); border-radius: 8px; padding: 0.85rem; margin-bottom: 0.75rem;">
            <div class="d-flex justify-between align-center mb-1">
              <span class="text-purple font-mono font-bold">${r.memory_id}</span>
              <span class="badge badge-purple">VERIFIED CANON</span>
            </div>
            <p style="font-size: 0.85rem; line-height: 1.4; color: #fff;">${r.content}</p>
            <div class="text-dim" style="font-size: 0.75rem; margin-top: 0.4rem;">
              Promoted by: ${r.metadata?.human_approver || 'Caretaker Ramesh'} · ${new Date(r.metadata?.promoted_at || Date.now()).toLocaleDateString()}
            </div>
          </div>
        `).join('');
      }

      if (!data.systemic_patterns.length) {
        patternsContainer.innerHTML = `<div class="empty-state"><p>Awaiting sufficient verified canon records to detect systemic campus trends.</p></div>`;
      } else {
        patternsContainer.innerHTML = data.systemic_patterns.map(p => `
          <div style="background: rgba(6, 182, 212, 0.08); border: 1px solid var(--cyan); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
            <strong class="text-cyan">${p.theme}</strong>
            <p style="font-size: 0.85rem; margin-top: 0.35rem; color: #fff;">${p.observation}</p>
            <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 0.82rem;">
              <span class="text-dim">Actionable Directive:</span>
              <span class="text-emerald font-bold">${p.dean_actionable_recommendation}</span>
            </div>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Error loading Dean view:', err);
    }
  }
  document.getElementById('btn-refresh-dean')?.addEventListener('click', loadDeanView);

  // 8. Meko Call Log Inspector
  async function loadLogs() {
    try {
      const res = await fetch('/api/logs?limit=150');
      const data = await res.json();
      renderLogsTable(data.logs || []);
    } catch (err) {
      console.error('Error loading logs:', err);
    }
  }

  function renderLogsTable(logs) {
    const tbody = document.getElementById('logs-table-body');
    const filterTool = document.getElementById('filter-tool').value;
    const filterDp = document.getElementById('filter-datapack').value;

    const filtered = logs.filter(l => {
      if (filterTool && l.tool !== filterTool) return false;
      if (filterDp && l.datapack !== filterDp) return false;
      return true;
    });

    tbody.innerHTML = filtered.map(l => {
      let badgeClass = 'badge-emerald';
      if (l.label === 'recalled') badgeClass = 'badge-cyan';
      else if (l.label === 'shared') badgeClass = 'badge-amber';
      else if (l.label === 'promoted') badgeClass = 'badge-purple';

      return `
        <tr>
          <td class="text-dim">${new Date(l.ts).toLocaleTimeString()}</td>
          <td class="text-muted font-bold">${l.agent}</td>
          <td class="text-cyan">${l.datapack}</td>
          <td><span class="badge ${badgeClass}">${l.tool}</span></td>
          <td><span class="text-dim">${l.label}</span></td>
          <td class="text-muted" style="max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${l.payload_summary}">
            ${l.payload_summary}
          </td>
          <td class="text-dim">${l.result_id || ''}</td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('filter-tool')?.addEventListener('change', loadLogs);
  document.getElementById('filter-datapack')?.addEventListener('change', loadLogs);
  document.getElementById('btn-refresh-logs')?.addEventListener('click', loadLogs);

  // 9. Reset System State
  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    if (!confirm('Reset all Meko memories, tickets, and logs for a clean demonstration?')) return;
    try {
      await fetch('/api/reset', { method: 'POST' });
      showToast('Meko memory and call logs reset to baseline.', 'toast-purple');
      location.reload();
    } catch (err) {
      showToast('Reset failed: ' + err.message, 'toast-error');
    }
  });

  // Telemetry Refresh Helper
  async function refreshSystemStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (ticketCountEl) ticketCountEl.innerText = data.tickets_count;
      if (callCountEl) callCountEl.innerText = data.calls_count;
    } catch (err) {
      console.warn('Status poll failed:', err);
    }
  }

  // Toast Helper
  function showToast(message, type = 'toast-purple') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Utility
  async function fetchAll(urls) {
    const responses = await Promise.all(urls.map(u => fetch(u)));
    return Promise.all(responses.map(r => r.json()));
  }

  // Initial Data Load
  await refreshSystemStatus();
  await loadCaretakerData();
});
