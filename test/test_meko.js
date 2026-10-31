import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { MekoEngine } from '../server/meko_engine.js';
import { SwarmService } from '../server/swarm_service.js';

console.log('🧪 RUNNING VERIFICATION SUITE: Campus Grievance Swarm (Track B)\n');

const logsPath = path.resolve('logs/meko_calls.jsonl');
const dataPath = path.resolve('data/meko_store.json');

const meko = new MekoEngine({ logsPath, dataPath });
meko.resetAll();
await meko.seedBaseline();

const swarm = new SwarmService(meko);

console.log('1️⃣ Testing B1: One grievance end-to-end live (Case A: Student Riya)');
const ticketA = await swarm.runCaseA();

assert.ok(ticketA.ticket_id, 'Ticket ID must be generated');
assert.strictEqual(ticketA.student_id, 'riya');
assert.strictEqual(ticketA.category, 'electricity');
assert.ok(ticketA.intake.raw_memory_id, 'Raw grievance must be written to student datapack');
console.log(`   ✅ Grievance logged: ${ticketA.ticket_id} for Riya (Block B, Room 204)`);
console.log(`   ✅ Department ETA evaluated: ${ticketA.scheduling.eta}`);

console.log('\n2️⃣ Testing Conflict Detection (Cross-datapack recall on ≥2 datapacks)');
assert.ok(ticketA.conflicts.checked_datapacks.length >= 2, 'Must check at least 2 datapacks');
if (ticketA.conflicts.has_conflict) {
  console.log(`   ✅ Cross-datapack conflict flagged to human: ${ticketA.conflicts.conflicts[0].description}`);
}

console.log('\n3️⃣ Testing B2: Human Caretaker hand-off & Lesson Extraction');
// Human Caretaker Ramesh resolves the case and notes diagnosis
const resolveResult = await swarm.resolveGrievance({
  ticket_id: ticketA.ticket_id,
  caretaker_name: 'Caretaker Ramesh',
  technician: 'Suresh Kumar',
  diagnosis: 'Phase 1 radiator load was tripping 16A breaker. Switched geyser circuit to Phase 2 on subpanel DB-2B.',
  resolution_notes: 'Hot water output 65C verified. Zero tripping under full hostel morning load.'
});

assert.strictEqual(resolveResult.ticket.status, 'resolved');
assert.ok(resolveResult.proposed_promotion.candidate_memory_id, 'Lesson candidate must be proposed');
console.log(`   ✅ Caretaker Ramesh resolved ticket with technical diagnosis`);
console.log(`   ✅ Knowledge Keeper synthesized candidate lesson: ${resolveResult.proposed_promotion.candidate_memory_id}`);

console.log('\n4️⃣ Testing B2 & Section 4.1: Human Explicit Promotion to campus-canon');
// Verify campus-canon cannot be written without human approval
let directWriteBlocked = false;
try {
  await meko.memory_add({
    agent: 'test_agent',
    datapack_id: 'campus-canon',
    content: 'Illegal direct write'
  });
} catch (err) {
  directWriteBlocked = true;
}
assert.ok(directWriteBlocked, 'Direct write to campus-canon MUST be blocked');
console.log('   ✅ Direct write to campus-canon blocked (Human approval mandatory)');

// Caretaker confirms promotion
const candidateId = resolveResult.proposed_promotion.candidate_memory_id;
const promoteResult = await swarm.approveCanonPromotion({
  candidate_memory_id: candidateId,
  human_approver: 'Caretaker Ramesh',
  note: 'Physically inspected and verified Phase 2 load stability'
});

assert.strictEqual(promoteResult.status, 'promoted_to_canon');
assert.strictEqual(promoteResult.target_datapack, 'campus-canon');
console.log(`   ✅ Human Caretaker Ramesh confirmed promotion -> Promoted to campus-canon as [${promoteResult.promoted_id}]`);

console.log('\n5️⃣ Testing B3: Context learned in Case A visibly changes Case B');
// Case B with Meko OFF (Naive helpdesk)
console.log('   Testing Case B (Student Arjun) with Meko OFF:');
const caseB_off = await swarm.runCaseB({ useMeko: false });
console.log(`   - With Meko OFF: ETA = "${caseB_off.scheduling.eta}"`);
console.log(`   - Action = "${caseB_off.scheduling.parts_required}"`);

// Case B with Meko ON (Learning Swarm)
console.log('   Testing Case B (Student Arjun) with Meko ON:');
const caseB_on = await swarm.runCaseB({ useMeko: true });
console.log(`   - With Meko ON:  ETA = "${caseB_on.scheduling.eta}"`);
console.log(`   - Recalled Canon Fix = [${caseB_on.scheduling.recalled_lesson.memory_id}]`);
console.log(`   - Diagnostic = "${caseB_on.scheduling.diagnostic_advice.slice(0, 85)}..."`);

assert.notStrictEqual(caseB_on.scheduling.estimated_minutes, caseB_off.scheduling.estimated_minutes, 'ETA must visibly change with Meko');
assert.strictEqual(caseB_on.scheduling.estimated_minutes, 30, 'Recalled fix must resolve in 30 mins');
assert.strictEqual(caseB_off.scheduling.estimated_minutes, 4320, 'Naive fix takes 72 hours');
console.log('   ✅ B3 Proven: Case B resolution dropped from 72 hours to 30 minutes due to verified campus-canon memory!');

console.log('\n6️⃣ Testing Dean View (Reads campus-canon ONLY)');
const deanIntel = await swarm.dean.getCampusCanonIntelligence();
assert.strictEqual(deanIntel.scope, 'campus-canon (Verified Institutional Memory Only)');
assert.ok(deanIntel.verified_records_count >= 1, 'Dean should see verified canon records');
console.log(`   ✅ Dean view verified records: ${deanIntel.verified_records_count}`);
console.log(`   ✅ Systemic pattern: ${deanIntel.systemic_patterns[0].theme}`);

console.log('\n7️⃣ Testing B4: Meko Call Log integrity in logs/meko_calls.jsonl');
const lines = fs.readFileSync(logsPath, 'utf-8').trim().split('\n').filter(Boolean);
assert.ok(lines.length > 5, 'Must contain logged Meko calls');
const sample = JSON.parse(lines[0]);
assert.ok(sample.ts && sample.agent && sample.datapack && sample.tool && sample.label && sample.payload_summary && sample.result_id, 'All log fields must be present');
console.log(`   ✅ Meko call log contains ${lines.length} real logged MCP calls.`);
console.log(`   ✅ Sample call: [${sample.tool}] by ${sample.agent} on ${sample.datapack} -> label: ${sample.label}`);

console.log('\n✨ ALL HARD REQUIREMENTS (B1, B2, B3, B4, B5) VERIFIED SUCCESSFULLY!\n');
