# DispatchGrid

> **Intelligent Workforce Scheduling & Real-Time Disruption Recovery Engine**  
> Automated shift dispatch, multi-constraint compliance, 2-opt route optimization, and autonomous recovery under field disruptions.

[![Tests](https://img.shields.io/badge/Tests-230%20Passed-emerald.svg)](https://vitest.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev)
[![Prisma](https://img.shields.io/badge/Prisma-6.4%20(SQLite)-2d3748.svg)](https://www.prisma.io)
[![Vite](https://img.shields.io/badge/Vite-6.1-646cff.svg)](https://vitejs.dev)

---

## 1. Quick Start & Setup

### Prerequisites
- **Node.js**: v20 or higher (v22 / v25 tested)
- **npm**: v10 or higher

### Launch the Complete Application
Run both backend and frontend concurrently with a single command from the project root:

```bash
# 1. Install dependencies across workspaces (if needed)
npm install

# 2. Reset and seed deterministic database (28 technicians, 165 jobs)
npm run db:seed

# 3. Start both Backend (port 5000) and Frontend (port 5173)
npm run dev
```

### Access URLs
- **Web Dashboard & Portal**: [http://localhost:5173](http://localhost:5173)
- **Login & Role Switcher**: [http://localhost:5173/login](http://localhost:5173/login)
- **Client / User Portal**: [http://localhost:5173/user-dashboard](http://localhost:5173/user-dashboard)
- **Specialist Field Console**: [http://localhost:5173/technician-dashboard](http://localhost:5173/technician-dashboard)
- **Admin Client Tracking**: [http://localhost:5173/customers](http://localhost:5173/customers)
- **Backend API**: [http://localhost:5000/api](http://localhost:5000/api)
- **Swagger / OpenAPI Documentation**: [http://localhost:5000/api/docs](http://localhost:5000/api/docs)
- **System Health Endpoint**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🔑 Groq API Key Configuration (AI Voice & Chat Booking)

The application includes an autonomous **AI Voice & Chat Booking Assistant** powered by Groq's high-speed **Llama 3.3 70B** model.

### Where to Put Your Groq API Key:
You can provide your Groq API key in any of the following locations:

1. **Backend Environment File** (`backend/.env`):
   ```env
   # =========================================================================
   # GROQ API KEY FOR AI VOICE & CHAT BOOKING ASSISTANT
   # Get your free API key at https://console.groq.com/keys
   # =========================================================================
   GROQ_API_KEY="gsk_your_groq_api_key_here"
   ```

2. **Frontend Environment File** (`frontend/.env`):
   ```env
   # Optional frontend client fallback
   VITE_GROQ_API_KEY="gsk_your_groq_api_key_here"
   ```

3. **Directly in the Web Interface (Zero Restart)**:
   - On the **User Dashboard** (`/user-dashboard`), click the floating **mic / chat button** at the bottom right.
   - Click the **Key icon (🔑)** in the chat header.
   - Paste your Groq API key and click **Save**. It is immediately active for your session.

> **Zero-Key Fallback**: Even without an API key, DispatchGrid includes an intelligent built-in local NLP parser that automatically identifies skills, service zones, urgency, and estimated duration from text and speech transcripts.

---

## 👥 Three Specialized Login Personas (`/login`)

1. **Client / End User (`/user-dashboard`)**:
   - For customers who hire technicians.
   - View personal booked appointments, assigned specialists, and real-time status.
   - Use the **floating mic / chat widget** at the bottom right to book appointments by voice or typing.

2. **Field Specialist / Technician (`/technician-dashboard`)**:
   - For field technicians.
   - **First-Time Login Onboarding**: Prompts new technicians for their **Full Name**, **Area of Expertise / Skills** (HVAC, Electrical, Plumbing, etc.), **Service Zones**, and **Shift Schedule**.
   - Saving immediately registers them in the database, updates their skills, and reflects their profile on the Admin Dashboard roster.
   - Toggle live availability (`AVAILABLE`, `ON_SHIFT`, `OFF_DUTY`, `UNAVAILABLE`) and inspect assigned work orders.

3. **Operations Dispatcher / Admin (`/` and `/customers`, `/technicians`)**:
   - Full system-wide visibility over both technicians and end users.
   - **Client Directory (`/customers`)**: Tracks all users who hire technicians, their appointment history, active service flights, and preferred skills.
   - **Technician Management & Removal (`/technicians`)**: View all technicians, edit profiles, or click **"Remove Specialist"** (supporting safe offboarding where active jobs are returned to the PENDING pool for reassignment).

---

## 2. 5-Minute Hackathon Demo Walkthrough

Follow this step-by-step path during your live pitch to showcase all core features end to end:

```
[Overview Dashboard] ──> [Scheduling Board] ──> [AI Explainability] ──> [Optimization] ──> [Disruption Recovery] ──> [Audit Trail]
       (/)                   (/scheduling)        (Decision Modal)     (/optimization)       (/disruptions)           (/audit)
```

### Step 1: Open Operations Control Center (`/`)
- Navigate to `http://localhost:5173`.
- Show the **Live Telemetry KPIs**: Total Jobs (165 seeded), Workforce Capacity (28 technicians across 5 zones), and 0 SLA Breaches.
- Notice the **Pristine Seed Banner** prompting you to run the initial dispatch.

### Step 2: Generate Workforce Schedule (`/scheduling`)
- Click **"Scheduling Board"** in the top navigation or banner.
- Review the 28 specialist lanes on the interactive Gantt chart.
- Click **"Generate Schedule"** $\rightarrow$ review scoring weights $\rightarrow$ click **"Run Scheduling Engine"**.
- Watch ~54 appointments appear instantly across the timeline with accurate travel buffers and zero overlaps.

### Step 3: Inspect AI Explainability (`/scheduling` or `/jobs`)
- Click any scheduled assignment block (e.g., *Emergency Incident #5* or *Civic Data Center*).
- Show the **Explainability Modal**:
  - **7 Hard Constraints Verified**: 100% compliant (skills, shift boundaries, SLA deadline, travel buffer, zone authorization, availability).
  - **Natural-Language Selection Rationale**: Explains exactly why this specialist was chosen over candidates.
- Now click an item from the **Unassigned Queue** (right sidebar):
  - View the root-cause diagnosis code (e.g., `NO_FEASIBLE_TIME_SLOT`), classification (`TEMPORARY` vs `PERMANENT`), and actionable guidance (e.g., *"Authorize 1 hour overtime or schedule early in next shift window"*).

### Step 4: Assignment Optimization Center (`/optimization`)
- Navigate to **"Optimization Center"** from the sidebar.
- Click **"Preview Impact"** to run a non-destructive dry run:
  - Demonstrates iterative 2-opt route reordering and gap compaction.
  - Displays simulated score improvement and transit time saved without touching the database.
- Click **"Optimize Schedule"** to commit the changes:
  - Quality score improves monotonically (mathematically guaranteed never to degrade).
  - View accepted operations and route reorderings in the audit table below.

### Step 5: Simulate Real-Time Disruption & Autonomous Recovery (`/disruptions`)
- Navigate to **"Disruption Simulator"**.
- Select **Scenario A: Technician Unavailable** (vehicle breakdown or illness) or **Scenario B: Urgent Job Arrival** (ICU emergency).
- Click **"Simulate & Recover"**:
  - The autonomous recovery engine detects affected jobs, frees the technician's appointments, and executes minimal-churn local rescheduling.
  - Review the instant recovery report: affected jobs, recovered jobs, and recovery duration (sub-50ms).
- Jump to **Recovery History** (`/recovery`) to inspect historical disruption logs.

### Step 6: Immutable Compliance Audit Trail (`/audit`)
- Navigate to **"Audit Logs"**.
- Point out the append-only log capturing every action (`JOB:CREATE`, `SCHEDULE:CREATE`, `OPTIMIZATION`, `DISRUPTION:REASSIGN`).
- Demonstrate strict immutability: direct updates or deletions are rejected with HTTP 403.

---

## 3. System Architecture

DispatchGrid is built as a modular monorepo using standard TypeScript:

```
dispatchgrid/
├── backend/                  # Node.js + Express + Prisma + SQLite
│   ├── prisma/
│   │   ├── schema.prisma     # 9 relational entities & constraints
│   │   ├── dev.db            # Local development SQLite database
│   │   └── seed/             # Deterministic PRNG seeder (28 tech, 165 jobs)
│   ├── src/
│   │   ├── controllers/      # REST API request handlers & schema parsing
│   │   ├── scheduling/       # Constraint solver & greedy dispatch engine
│   │   ├── optimization/     # 2-opt local search & workload balancer
│   │   ├── recovery/         # Autonomous disruption replanning engine
│   │   ├── explainability/   # Decision scorecards & root-cause analyzer
│   │   ├── services/         # Business logic & transactional mutations
│   │   └── validators/       # Zod validation & state machine definitions
│   └── tests/                # 17 Vitest test suites (194 tests)
└── frontend/                 # React 18 + Vite 6 + Tailwind CSS
    ├── src/
    │   ├── components/       # Common UI, Badges, Modals, Gantt Timeline
    │   ├── pages/            # Dashboard, Board, Optimization, Disruptions, Audit
    │   ├── services/         # Typed API client with retry and error handling
    │   └── types/            # TypeScript interfaces matching backend models
    └── tests/                # RTL + Vitest component tests (36 tests)
```

### Relational Data Models (Prisma & SQLite)
1. `Technician`: Specialist profiles, certified skills (JSON), authorized zones, shift hours.
2. `Job`: Customer service work orders, priority, duration, GPS coordinates, SLA deadlines, lifecycle state.
3. `Assignment`: Scheduled appointments tying Job to Technician with transit time.
4. `SchedulingRun`: Execution records tracking objective scores, SLA violations, and travel time.
5. `SchedulingRunDetail`: Fine-grained decision logs, rejected candidates, and explanations.
6. `DisruptionEvent`: Frontline anomaly events (illness, delays, cancellations, emergencies).
7. `TechnicianUnavailability`: Planned or emergency leave windows.
8. `AuditLog`: Cryptographically append-only immutable state mutation records.
9. `IdempotencyRecord`: Distributed request deduplication caching.

---

## 4. Scheduling & Optimization Logic

### A. Initial Scheduling Engine (Greedy Construction with Multi-Criteria Scoring)
- **Job Ordering**: Jobs are prioritized by urgency score:
  $$\text{Urgency} = w_{\text{priority}} \times \text{PriorityWeight} + w_{\text{sla}} \times \frac{1}{\max(1, \text{SLA Deadline} - \text{Shift Start})}$$
- **Hard Constraint Enforcement** (Zero-Violation Invariants):
  1. *Skill Certification*: $\text{JobSkills} \subseteq \text{TechSkills}$
  2. *Zone Authorization*: $\text{JobZone} \in \text{TechZones}$
  3. *Shift Window*: $\text{ShiftStart} \le \text{Start} < \text{End} \le \text{ShiftEnd}$
  4. *No Overlaps*: $\forall \text{asgn}_i, \text{asgn}_j : [\text{Start}_i, \text{End}_i] \cap [\text{Start}_j, \text{End}_j] = \emptyset$
  5. *Travel Buffer*: $\text{Start}_{i+1} \ge \text{End}_i + \text{Transit}(\text{Job}_i, \text{Job}_{i+1})$
  6. *SLA Protection*: $\text{End} \le \text{SLADeadline}$
  7. *Unavailability Windows*: No collision with PTO or maintenance intervals.
- **Transit Calculation**: Accurate great-circle distance via Haversine formula assuming standard 30 km/h urban transit velocity.

### B. Iterative Local Search & 2-Opt Optimization
- **Monotonic Hill-Climbing**: Evaluates a weighted objective function:
  $$F(S) = w_1 \cdot \text{Quality} + w_2 \cdot \text{SLA Margin} - w_3 \cdot \text{Total Travel} - w_4 \cdot \text{Workload Variance}$$
- **2-Opt Route Inversion**: Iteratively swaps stop sequences within a technician's route if travel time is reduced without violating downstream SLA deadlines.
- **Workload Balancer**: Transfers flexible appointments from overloaded specialists to underutilized qualified peers.
- **Strict Monotonicity**: A candidate schedule is only accepted if $F(S') \ge F(S)$. Regressions are rejected.

### C. Disruption Management & Autonomous Recovery
- **Minimal Schedule Churn**: Isolates the disruption to affected appointments. Unaffected technicians' schedules remain frozen.
- **Tiered Recovery Priority**: Critical SLA work orders are reassigned into nearest available qualified specialist gaps.
- **Atomic Execution**: All reassignments, status transitions, and audit records execute in an atomic SQLite transaction (`prisma.$transaction`).

---

## 5. Verification & Test Commands

DispatchGrid includes automated test suites and end-to-end verification scripts:

```bash
# Run all 194 backend tests (unit, integration, stress, security)
npm run test:backend

# Run all 36 frontend component & API client tests
npm run test:frontend

# Run full monorepo tests (230 total tests)
npm run test

# Verify production builds
npm run build:backend
npm run build:frontend

# Run specialized end-to-end verification scripts
npm run verify:schedule       # Validates zero-overlap invariant on 165 jobs
npm run verify:optimization   # Validates 2-opt quality score improvement
npm run verify:recovery       # Validates autonomous replanning on 3 disruption scenarios
npm run verify:phase8         # Validates explainability scorecards & audit immutability
npm run verify:user-journey   # Full 17-step end-to-end simulation
```

---

## 6. Key Project Highlights for Judges

| Feature | Implementation Highlights |
| :--- | :--- |
| **Deterministic Data** | 28 technicians and 165 jobs generated via seeded PRNG (`0x1337BEEF`) |
| **Zero Overlaps** | 100% hard-constraint verification across 51 pairwise checks |
| **Explainable AI** | Full decision scorecards with 7 hard-constraint audits & natural-language rationales |
| **Autonomous Recovery** | Handles 6 disruption scenarios with minimal churn in under 50ms |
| **Immutable Auditing** | Append-only audit log protected by database triggers & HTTP 403 guards |
| **Production Ready** | 230 passing tests, strict TypeScript types, zero lint errors, and verified production bundles |
