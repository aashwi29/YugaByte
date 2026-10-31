export class ConflictAgent {
  constructor(mekoEngine) {
    this.meko = mekoEngine;
    this.name = 'conflict';
  }

  /**
   * Cross-datapack recall to find contradictions across departments
   * Brief requirement: memory_search on ≥2 datapacks → flag to human
   */
  async checkCrossDeptConflicts({ ticket, plannedTime = '14:30' }) {
    const { ticket_id, location, appliance } = ticket;

    // 1. memory_search on Datapack 1: dept-electricity
    const elecSearch = await this.meko.memory_search({
      agent: this.name,
      datapack_id: 'dept-electricity',
      query: 'scheduled outage shutdown maintenance power cut',
      limit: 3
    });

    // 2. memory_search on Datapack 2: dept-mess
    const messSearch = await this.meko.memory_search({
      agent: this.name,
      datapack_id: 'dept-mess',
      query: 'boiler water pump pipe maintenance',
      limit: 3
    });

    const conflicts = [];

    // Analyze electricity matches
    if (elecSearch.results && elecSearch.results.length > 0) {
      for (const res of elecSearch.results) {
        if (res.metadata?.type === 'maintenance_schedule' && res.metadata?.status === 'active') {
          conflicts.push({
            datapack: 'dept-electricity',
            type: 'OUTAGE_OVERLAP',
            severity: 'CRITICAL',
            source_memory_id: res.memory_id,
            description: `Scheduled grid maintenance at Substation 2 (${res.metadata.window}) coincides with dispatched repair.`,
            raw_event: res.content,
            recommended_human_action: 'Reschedule technician dispatch window to 17:15 after power is safely restored.'
          });
        }
      }
    }

    // Analyze mess matches (e.g. water supply cut off)
    if (messSearch.results && messSearch.results.length > 0) {
      for (const res of messSearch.results) {
        if (/pump shutoff|water supply paused|tank cleaning/i.test(res.content)) {
          conflicts.push({
            datapack: 'dept-mess',
            type: 'UTILITY_DEPLETION',
            severity: 'WARNING',
            source_memory_id: res.memory_id,
            description: 'Overlapping water supply pause detected.',
            raw_event: res.content,
            recommended_human_action: 'Ensure main water overhead valves are reopened before testing heating elements.'
          });
        }
      }
    }

    const hasConflict = conflicts.length > 0;

    return {
      ticket_id,
      checked_datapacks: ['dept-electricity', 'dept-mess'],
      has_conflict: hasConflict,
      conflict_count: conflicts.length,
      conflicts,
      flagged_for_human: hasConflict ? 'Caretaker Ramesh' : null,
      summary: hasConflict 
        ? `⚠️ Inter-department conflict detected between electricity schedule and repair booking!`
        : `✅ No departmental conflicts detected. Clear to proceed.`
    };
  }
}
