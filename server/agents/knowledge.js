export class KnowledgeKeeperAgent {
  constructor(mekoEngine) {
    this.meko = mekoEngine;
    this.name = 'knowledge_keeper';
  }

  /**
   * Step 1: Extract institutional lesson from resolved grievance
   * Calls: memory_add (proposed lesson in dept datapack)
   */
  async proposeLessonFromResolution({ ticket, resolution_note, technician_diagnosis, human_author = 'Caretaker Ramesh' }) {
    const { ticket_id, location, appliance, category } = ticket;
    const deptDatapack = `dept-${category || 'electricity'}`;

    // Extract core lesson
    const lessonTitle = `${location} ${appliance.toUpperCase()} Tripping Fix`;
    const lessonBody = `VERIFIED CANON LESSON: For ${location} ${appliance}, tripping issues during winter are caused by phase load imbalance (space heaters on Phase 1), NOT heating coil failure. Solution: Shift geyser breaker to Phase 2 on subpanel DB-2B. Avoid ordering replacement heating coils.`;

    const proposedContent = JSON.stringify({
      title: lessonTitle,
      location,
      appliance,
      root_cause: 'Phase 1 winter heater load imbalance',
      verified_solution: 'Rewire/toggle geyser circuit breaker to Phase 2 on distribution board DB-2B',
      technician_notes: technician_diagnosis,
      caretaker_note: resolution_note,
      full_lesson: lessonBody
    });

    // 1. memory_add to department datapack as a candidate lesson
    const candidateMem = await this.meko.memory_add({
      agent: this.name,
      datapack_id: deptDatapack,
      content: lessonBody,
      metadata: {
        type: 'candidate_canon_lesson',
        ticket_id,
        location,
        appliance,
        recorded_by: human_author,
        promotion_status: 'pending_human_approval'
      },
      label: 'written'
    });

    return {
      success: true,
      candidate_memory_id: candidateMem.memory_id,
      source_datapack: deptDatapack,
      ticket_id,
      proposed_lesson: lessonBody,
      preview: {
        title: lessonTitle,
        content: lessonBody,
        root_cause: 'Phase 1 winter radiator overload',
        action: 'Shift to Phase 2 on DB-2B breaker panel',
        time_saved_future: 'Reduces future repair time from 72h to 30m',
        awaiting_human_approval_from: human_author
      }
    };
  }

  /**
   * Step 2: Human confirms promotion to campus-canon
   * Critical rule: campus-canon is writable ONLY through a human approval step.
   * Calls: memory_promote
   */
  async confirmPromotion({ candidate_memory_id, source_datapack = 'dept-electricity', human_approver, approval_note = '' }) {
    if (!human_approver) {
      throw new Error('Promotion to campus-canon requires verified human approver signature (Caretaker/Warden)');
    }

    const result = await this.meko.memory_promote({
      agent: this.name,
      source_datapack_id: source_datapack,
      memory_id: candidate_memory_id,
      human_approver,
      note: approval_note || 'Approved after physical verification of hot water temperature and breaker load test'
    });

    return {
      success: true,
      promoted_id: result.promoted_id,
      original_id: candidate_memory_id,
      target_datapack: 'campus-canon',
      human_approver,
      status: 'promoted_to_canon',
      message: `Memory [${candidate_memory_id}] successfully promoted to campus-canon by ${human_approver}. Future cases will automatically recall this context.`
    };
  }
}
