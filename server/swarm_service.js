import { IntakeAgent } from './agents/intake.js';
import { DepartmentAgent } from './agents/department.js';
import { ConflictAgent } from './agents/conflict.js';
import { KnowledgeKeeperAgent } from './agents/knowledge.js';
import { DeanAgent } from './agents/dean.js';

export class SwarmService {
  constructor(mekoEngine) {
    this.meko = mekoEngine;
    this.intake = new IntakeAgent(mekoEngine);
    this.electricity = new DepartmentAgent(mekoEngine, 'electricity');
    this.mess = new DepartmentAgent(mekoEngine, 'mess');
    this.conflict = new ConflictAgent(mekoEngine);
    this.knowledgeKeeper = new KnowledgeKeeperAgent(mekoEngine);
    this.dean = new DeanAgent(mekoEngine);

    // Active ticket registry in memory
    this.tickets = new Map();
    this.pendingPromotions = new Map();
  }

  /**
   * B1 — Full Live Grievance Pipeline
   * Student raises problem -> Intake -> Department (with Conflict check) -> Caretaker Queue
   */
  async handleNewGrievance({ student_id, student_name, room, text, useMeko = true }) {
    // Step 1: Intake Agent parses, dedupes, logs to student datapack
    const intakeResult = await this.intake.processGrievance({
      student_id,
      student_name,
      room,
      text
    });

    const ticketId = intakeResult.ticket_id;

    // Step 2: Department Agent evaluates ETA and past context
    const deptAgent = intakeResult.category === 'mess' ? this.mess : this.electricity;
    const scheduleResult = await deptAgent.evaluateAndSchedule({
      ticket: intakeResult,
      useMeko
    });

    // Step 3: Conflict Agent checks cross-datapack contradictions (e.g. power cuts)
    const conflictResult = await this.conflict.checkCrossDeptConflicts({
      ticket: intakeResult,
      plannedTime: '14:30'
    });

    const ticket = {
      ticket_id: ticketId,
      student_id,
      student_name,
      room,
      text,
      category: intakeResult.category,
      location: intakeResult.location,
      appliance: intakeResult.appliance,
      symptom: intakeResult.symptom,
      status: conflictResult.has_conflict ? 'needs_schedule_adjustment' : 'technician_dispatched',
      created_at: new Date().toISOString(),
      useMeko,
      intake: intakeResult,
      scheduling: scheduleResult,
      conflicts: conflictResult,
      is_resolved: false,
      resolution: null
    };

    this.tickets.set(ticketId, ticket);
    return ticket;
  }

  /**
   * B2 — Human Caretaker records resolution note & technical diagnosis
   * Hand-off 1: Person acts on what an agent recalled/flagged
   * Hand-off 2: Knowledge Keeper synthesizes lesson and requests human approval
   */
  async resolveGrievance({ ticket_id, caretaker_name = 'Caretaker Ramesh', technician = 'Suresh Kumar', diagnosis, resolution_notes }) {
    const ticket = this.tickets.get(ticket_id);
    if (!ticket) throw new Error(`Ticket ${ticket_id} not found`);

    ticket.is_resolved = true;
    ticket.status = 'resolved';
    ticket.resolved_at = new Date().toISOString();
    ticket.resolution = {
      caretaker: caretaker_name,
      technician,
      diagnosis: diagnosis || 'Phase 1 radiator load was tripping 16A breaker. Switched geyser circuit to Phase 2 on subpanel DB-2B.',
      notes: resolution_notes || 'Water heater verified hot at 65°C. Breaker holding steady under load.'
    };

    // Inform student via student private datapack
    await this.meko.memory_add({
      agent: 'intake',
      datapack_id: `student-${ticket.student_id}-private`,
      content: `RESOLUTION NOTICE for [${ticket_id}]: Issue resolved by ${caretaker_name} & ${technician}. Diagnosis: ${ticket.resolution.diagnosis}`,
      metadata: {
        type: 'ticket_resolved',
        ticket_id
      },
      label: 'written'
    });

    // Knowledge Keeper extracts proposed lesson and stages for human confirmation
    const proposed = await this.knowledgeKeeper.proposeLessonFromResolution({
      ticket,
      resolution_note: ticket.resolution.notes,
      technician_diagnosis: ticket.resolution.diagnosis,
      human_author: caretaker_name
    });

    this.pendingPromotions.set(proposed.candidate_memory_id, {
      ...proposed,
      ticket_id
    });

    return {
      ticket,
      proposed_promotion: proposed
    };
  }

  /**
   * Critical Rule & B2: Human explicit confirmation to promote to campus-canon
   */
  async approveCanonPromotion({ candidate_memory_id, human_approver = 'Caretaker Ramesh', note }) {
    const pending = this.pendingPromotions.get(candidate_memory_id);
    if (!pending) throw new Error(`No pending promotion found for memory ${candidate_memory_id}`);

    const promoteResult = await this.knowledgeKeeper.confirmPromotion({
      candidate_memory_id,
      source_datapack: pending.source_datapack || 'dept-electricity',
      human_approver,
      approval_note: note || 'Verified fix physically inspected and confirmed stable.'
    });

    this.pendingPromotions.delete(candidate_memory_id);
    return promoteResult;
  }

  /**
   * Get all tickets
   */
  getAllTickets() {
    return Array.from(this.tickets.values()).reverse();
  }

  /**
   * Get pending promotions
   */
  getPendingPromotions() {
    return Array.from(this.pendingPromotions.values());
  }

  /**
   * Run the canonical Case A scenario (Riya's complaint)
   */
  async runCaseA() {
    const riyaGrievance = {
      student_id: 'riya',
      student_name: 'Riya Patel',
      room: '204',
      text: 'The geyser in the 2nd floor bathroom gives lukewarm water and then the lights flicker and it completely stops heating.',
      useMeko: true
    };
    return await this.handleNewGrievance(riyaGrievance);
  }

  /**
   * Run Case B (Arjun's complaint) with Meko ON or OFF
   */
  async runCaseB({ useMeko = true }) {
    const arjunGrievance = {
      student_id: 'arjun',
      student_name: 'Arjun Sen',
      room: '212',
      text: 'Water heater is totally dead again in 2nd floor washroom, no warm water this morning.',
      useMeko
    };
    return await this.handleNewGrievance(arjunGrievance);
  }
}
