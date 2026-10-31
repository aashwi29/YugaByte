# ⚡ Campus Grievance Swarm
### hackCBS 9.0 · Meko Challenge · Track B

> **The learning layer between a ticket system and institutional memory.**  
> Built with **Meko** (Yugabyte-powered persistent agent context layer) over the **Model Context Protocol (MCP)**.

---

## 1. What You Are Building & Executive Summary

Most university campuses handle student grievances using generic helpdesk ticket systems. These systems are transactional: a ticket is opened, a worker attends to it (or doesn't), the ticket is closed, and the knowledge disappears into a silo. 

**Campus Grievance Swarm is NOT a generic helpdesk.** It is an institutional learning system where:
1. Students report complaints in natural language.
2. Specialized AI agents collaborate through **Meko** (a shared, scoped context layer).
3. Human campus staff (caretakers, wardens, electricians) make the final decisions.
4. **Context learned in one resolved case visibly changes the outcome of a later case.**
5. A **live swarm view** renders every real Meko MCP call as a moving particle edge on an interactive board.

By decoupling memory from individual personnel and preserving verified solutions in a governed canon, the campus actively *learns* instead of repeating mistakes every semester.

---

## 2. The Problem (Unsoftened)

Campuses lose complaints, repeat expensive work, and forget fixes:

- **Lost or Counted Twice:** Forty students report one dead washroom router or lukewarm geyser using five different wordings. Reports vanish, get treated as isolated incidents, or create duplicate work orders.
- **Silence & Missing ETAs:** Students submit a complaint and hear nothing for days. Frustration builds, and students chase staff or complain louder on social media.
- **Fixed, Then Forgotten:** Every winter, campus maintenance rediscovers why the hostel geysers trip the circuit breaker because nobody recorded what was tried last year.
- **Departments Don't Share:** The electricity department schedules a substation maintenance power outage, yet the hostel caretaker books an electrician to inspect water heaters at that exact time. The technician arrives to find no power and walks away.
- **Knowledge Walks Out:** A knowledgeable caretaker transfers, an electrician retires, or a student hostel secretary graduates. Next semester, institutional memory resets to zero.
- **Leadership Sees Anecdotes:** The Dean hears whoever screams loudest or whoever sends the angriest email, rather than observing verified, systemic infrastructure patterns.

---

## 3. The Solution: Meko as the Institutional Memory Layer

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                                PERSONS                                  │
 │   Student (Riya / Arjun)   │   Caretaker (Ramesh)   │  Dean (Dr. Sharma)│
 └──────────────────┬──────────────────────┬──────────────────────┬────────┘
                    │                      │                      │
 ┌──────────────────▼──────────────────────▼──────────────────────▼────────┐
 │                              AI AGENTS                                  │
 │   Intake Agent   │   Dept Agent   │  Conflict Agent  │ Knowledge Keeper │
 └──────────────────┬──────────────────────┬──────────────────────┬────────┘
                    │                      │                      │
                    ▼                      ▼                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                   MEKO CONTEXT LAYER (MCP Datapacks)                    │
 │ ┌──────────────────────┐  ┌───────────────────┐  ┌───────────────────┐ │
 │ │ student-<id>-private │  │  dept-electricity │  │   campus-canon    │ │
 │ │ (Private student log)│  │ (Active ops & ETA)│  │ (Verified lessons)│ │
 │ └──────────────────────┘  └───────────────────┘  └───────────────────┘ │
 └─────────────────────────────────────────────────────────────────────────┘
```

The system organizes institutional context into **isolated Datapacks** accessed over MCP tool calls (`memory_add`, `memory_search`, `memory_promote`, `knowledgebase_search`). 

Each agent operates within strict privacy and authority boundaries, while the human caretaker acts as the gatekeeper who verifies real-world fixes before promoting them to campus-wide memory.

---

## 4. Hard Requirements Compliance Matrix (Track B)

| Requirement | Description | How Campus Grievance Swarm Fulfills It |
|---|---|---|
| **B1 — One Grievance, End to End, Live** | A student raises a problem in their own words; the right people act; the student always sees where it stands and why. | A student submits a natural language grievance (e.g. *"The geyser in the 2nd floor bathroom gives lukewarm water and then the lights flicker and it completely stops heating"*). The Intake agent logs it to `student-<id>-private`, clusters duplicates, the Department agent evaluates a believable ETA, the Conflict agent flags power cuts, and the student receives continuous status updates. |
| **B2 — People and Agents in Sync Through Meko** | At least one hand-off each way: an agent acts on what a person recorded, AND a person acts on what an agent recalled or flagged. | **Agent → Person:** The Conflict agent recalls an overlapping power outage from `dept-electricity` and flags it to Caretaker Ramesh.<br>**Person → Agent:** Caretaker Ramesh inspects the circuit, enters the physical diagnosis into the system, reviews the candidate lesson staged by the Knowledge Keeper, and signs off on `memory_promote`. |
| **B3 — Context Changes a Later Case** | Something learned in case A must visibly change case B for a different student, place, or team. With Meko off, it must not. | **Case A (Student Riya):** Geyser trips; diagnosed as Phase 1 radiator load; promoted to canon.<br>**Case B (Student Arjun):**<br>• **With Meko ON:** Department agent recalls the canon fix → **ETA: 30 minutes**, breaker shifted to Phase 2, ₹0 parts wasted.<br>• **With Meko OFF:** Naive helpdesk assumes coil failure → **ETA: 72 hours**, orders unnecessary ₹4,500 replacement coil. |
| **B4 — Swarm View** | A live board showing every person, every agent, every datapack, and each Meko call as it happens (written / recalled / shared / promoted), with a feed of what was said. | An interactive canvas graph rendering all Persons, Agents, and Datapacks. Live particle pulses travel along edges for every real Meko MCP call. The live drawer displays the exact payload summary, backed by `logs/meko_calls.jsonl`. |
| **B5 — Honest and Private** | No personal data in Meko that the story doesn't need. Nothing shown as context that Meko didn't actually return. | Student personal complaints remain strictly isolated in `student-<id>-private`. `campus-canon` contains only sanitized technical root causes. No mock or hallucinated context is displayed unless returned by a real Meko search call. |

---

## 5. Architecture & Scopes

### 5.1 Datapacks (Meko Scopes)

Every Meko MCP call passes an explicit `datapack_id`:

1. **`student-<id>-private` (e.g. `student-riya-private`, `student-arjun-private`):**
   - **Purpose:** Stores the raw, unstructured student complaint and student-visible status messages.
   - **Access:** Written only by Intake Agent. Read only by Intake Agent and Student UI.
   - **Privacy:** Contains student name, room number, and verbatim text. Never exposed to cross-department search.

2. **`dept-electricity`:**
   - **Purpose:** Stores technical equipment specifications, active maintenance schedules, outage windows, and preliminary candidate lessons.
   - **Access:** Written by Electricity Agent and Caretaker. Read by Electricity Agent and Conflict Agent.

3. **`dept-mess`:**
   - **Purpose:** Stores catering utility logs, commercial boiler status, and kitchen maintenance schedules.
   - **Access:** Written by Mess Agent. Read by Mess Agent and Conflict Agent.

4. **`campus-canon`:**
   - **Purpose:** The permanent, verified institutional knowledge base for the entire university.
   - **Access:** **Writable ONLY through explicit human approval step** using `memory_promote`. Read-only for Dean View and all agents performing B3 contextual recall.

> [!IMPORTANT]
> **The Canon Governance Rule:** Direct writes to `campus-canon` via `memory_add` are rejected with an error. The Knowledge Keeper stages candidate lessons in the department datapack; only after a human caretaker or warden reviews the exact preview and clicks "Confirm Promotion" does `memory_promote` execute.

---

### 5.2 Logical Agents (Sharing One MCP Endpoint)

All agents share a unified Meko MCP interface while executing specialized institutional roles:

```mermaid
flowchart TD
    Student(["🎓 Student"]) -->|1. Natural Language Grievance| Intake["🤖 Intake Agent"]
    Intake -->|2. memory_add| PrivDP[("🔒 student-<id>-private")]
    Intake -->|3. memory_search (dedupe)| DeptDP[("⚡ dept-electricity")]
    Intake -->|4. Route grievance| DeptAgent["⚡ Department Agent"]
    
    DeptAgent -->|5. knowledgebase_search| CanonDP[("🌟 campus-canon")]
    ConflictAgent["⚠️ Conflict Agent"] -->|6. memory_search (outages)| DeptDP
    ConflictAgent -->|7. Cross-check| MessDP[("🍲 dept-mess")]
    
    ConflictAgent -.->|8. Flag contradiction| Caretaker(["🛠️ Caretaker Ramesh"])
    DeptAgent -.->|9. Dispatched plan & ETA| Caretaker
    
    Caretaker -->|10. Physical Diagnosis & Fix| KK["🧠 Knowledge Keeper"]
    KK -->|11. memory_add (candidate)| DeptDP
    Caretaker -->|12. Review & Explicit Approval| KK
    KK -->|13. memory_promote| CanonDP
    
    Dean(["🏛️ Dean Dr. Sharma"]) -->|14. knowledgebase_search| CanonDP
```

1. **Intake Agent:**
   - Parses the student's natural language input.
   - Deduplicates and clusters reports using `memory_search` against active tickets to prevent 40 students filing 40 disconnected tasks for the same dead router or cold geyser.
   - Writes status updates to the student's private datapack so the student always knows where the ticket stands.

2. **Department Agent (Electricity / Mess):**
   - Recalls past institutional fixes from `campus-canon` and checks local equipment context in `dept-electricity`.
   - Computes a believable, realistic ETA.
   - Demonstrates the difference between Meko ON (instant recall of past fixes) and Meko OFF (naive blind part ordering).

3. **Conflict Agent:**
   - Performs cross-datapack search across `dept-electricity` and `dept-mess`.
   - Detects schedule collisions (e.g., planned substation power outages occurring during a booked geyser inspection).
   - Prevents wasted technician visits and informs staff upfront.

4. **Knowledge Keeper Agent:**
   - When a caretaker or technician resolves a grievance, this agent extracts the underlying engineering lesson (distinguishing symptoms from root causes).
   - Stages the candidate lesson and displays a full preview to human supervisors.
   - Promotes the verified memory to `campus-canon` upon receiving human authorization.

5. **Dean View (Read-Only):**
   - Strictly queries `campus-canon` using `knowledgebase_search`.
   - Aggregates verified lessons to identify campus-wide systemic patterns (e.g., phase load balancing issues across substation distribution blocks) rather than reacting to anecdotes.

---

## 6. The B3 Learning Showcase: Case A vs. Case B

The system provides an empirical demonstration of institutional learning:

### Case A: Student Riya (Initial Breakdown)
- **Complaint:** Riya Patel (Hostel Block B, Room 204) reports that the 2nd floor geyser gives lukewarm water, lights flicker, and then the unit trips out completely.
- **Investigation:** Electrician Suresh Kumar tests the unit. The heating element is completely intact. The root cause is that 16A winter radiator loads on Phase 1 cause the main breaker to trip under simultaneous morning usage.
- **Fix:** Circuit shifted to Phase 2 on subpanel DB-2B. Water output heated to 65°C.
- **Knowledge Synthesis:** Knowledge Keeper extracts: *"Block B Floor 2 geyser tripping is caused by Phase 1 winter radiator overload, NOT coil failure. Shift breaker to Phase 2 on subpanel DB-2B."*
- **Human Promotion:** Caretaker Ramesh approves promotion to `campus-canon`.

### Case B: Student Arjun (Later Breakdown)
- **Complaint:** Arjun Sen (Hostel Block B, Room 212) reports cold washroom water days later.
- **With Meko ON (Learning System):**
  - Department agent queries `campus-canon` and immediately recalls the Case A lesson.
  - Generates actionable advice: *"Recalled from Campus Canon: Phase 1 overload issue. Shift breaker to Phase 2 on DB-2B. Do NOT replace heating element."*
  - **Resolution Time:** **30 minutes**.
  - **Wasted Parts:** **₹0**.
- **With Meko OFF (Siloed Helpdesk):**
  - Department agent has no access to shared institutional memory.
  - Assumes heating coil failure. Files part requisition with vendor.
  - **Resolution Time:** **72 hours (3 days of cold showers)**.
  - **Wasted Parts:** **₹4,500 spent on unnecessary heating coil**.

---

## 7. The Live Swarm View (B4)

The Swarm View provides real-time observability of every interaction in the system:
- **Interactive Nodes:** Visualizes Persons (Students, Caretakers, Dean), AI Agents (Intake, Dept, Conflict, Knowledge Keeper, Dean), and Datapacks (`student-*-private`, `dept-*`, `campus-canon`).
- **Dynamic Particle Edges:** Real Meko tool calls trigger particle pulses moving along the exact source-to-target path:
  - 🟢 **`written` (`memory_add`):** Emerald green particle.
  - 🔵 **`recalled` (`memory_search`):** Electric cyan particle.
  - 🟡 **`shared` (cross-datapack conflict check):** Amber gold particle.
  - 🟣 **`promoted` (`memory_promote`):** Royal violet particle and radial shockwave into `campus-canon`.
- **Live Stream Drawer:** Connected via Server-Sent Events (`/api/stream`), displaying live timestamps, agents, datapacks, tool names, and payload summaries.
- **Auditability:** Every visual element is backed by an append-only JSON line in [`logs/meko_calls.jsonl`](file:///d:/Programming/PYTHON/Pythonn/YUGABYTE%20Project/logs/meko_calls.jsonl).

---

## 8. Summary of Impact & Institutional ROI

1. **Elimination of "Groundhog Day" Maintenance:** Solutions verified once become permanent campus knowledge.
2. **Dramatic Downtime Reduction:** Repeat electrical issues drop from 72 hours to 30 minutes.
3. **Budget Preservation:** Prevents hundreds of thousands of rupees spent on premature component replacements.
4. **Inter-Departmental Synchronization:** Eliminates wasted technician visits by detecting utility schedule conflicts before dispatch.
5. **Data-Driven Administration:** University leadership gains verified infrastructure analytics directly from `campus-canon`.

---

*For detailed code architecture, file-by-file breakdowns, API endpoints, and step-by-step execution guides, please refer to [`CODE_AND_EXECUTION.md`](file:///d:/Programming/PYTHON/Pythonn/YUGABYTE%20Project/CODE_AND_EXECUTION.md).*
