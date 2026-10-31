-- CreateTable
CREATE TABLE "technicians" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "skills" TEXT NOT NULL,
    "serviceZones" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "shiftStart" TEXT NOT NULL,
    "shiftEnd" TEXT NOT NULL,
    "availabilityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredSkills" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "estimatedDuration" INTEGER NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "serviceZone" TEXT NOT NULL,
    "earliestStart" DATETIME NOT NULL,
    "latestEnd" DATETIME NOT NULL,
    "slaDeadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "scheduledStart" DATETIME NOT NULL,
    "scheduledEnd" DATETIME NOT NULL,
    "travelTime" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "assignments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assignments_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scheduling_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "objectiveScore" REAL,
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "assignedJobs" INTEGER NOT NULL DEFAULT 0,
    "unassignedJobs" INTEGER NOT NULL DEFAULT 0,
    "totalTravelTime" INTEGER NOT NULL DEFAULT 0,
    "slaViolations" INTEGER NOT NULL DEFAULT 0,
    "technicianUtilization" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "scheduling_run_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schedulingRunId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "selectedTechnicianId" TEXT,
    "previousTechnicianId" TEXT,
    "scheduledStart" DATETIME,
    "scheduledEnd" DATETIME,
    "assignmentStatus" TEXT NOT NULL,
    "explanation" TEXT,
    "rejectionReasons" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduling_run_details_schedulingRunId_fkey" FOREIGN KEY ("schedulingRunId") REFERENCES "scheduling_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scheduling_run_details_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scheduling_run_details_selectedTechnicianId_fkey" FOREIGN KEY ("selectedTechnicianId") REFERENCES "technicians" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "scheduling_run_details_previousTechnicianId_fkey" FOREIGN KEY ("previousTechnicianId") REFERENCES "technicians" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "disruption_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "technicianId" TEXT,
    "jobId" TEXT,
    "description" TEXT NOT NULL,
    "eventPayload" TEXT,
    "recoveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "disruption_events_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "disruption_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "technician_unavailabilities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "technicianId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "technician_unavailabilities_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "system_audits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "technicians_email_key" ON "technicians"("email");

-- CreateIndex
CREATE INDEX "technicians_availabilityStatus_idx" ON "technicians"("availabilityStatus");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_priority_idx" ON "jobs"("priority");

-- CreateIndex
CREATE INDEX "jobs_serviceZone_idx" ON "jobs"("serviceZone");

-- CreateIndex
CREATE INDEX "jobs_earliestStart_latestEnd_idx" ON "jobs"("earliestStart", "latestEnd");

-- CreateIndex
CREATE INDEX "jobs_slaDeadline_idx" ON "jobs"("slaDeadline");

-- CreateIndex
CREATE INDEX "assignments_jobId_idx" ON "assignments"("jobId");

-- CreateIndex
CREATE INDEX "assignments_technicianId_idx" ON "assignments"("technicianId");

-- CreateIndex
CREATE INDEX "assignments_scheduledStart_scheduledEnd_idx" ON "assignments"("scheduledStart", "scheduledEnd");

-- CreateIndex
CREATE INDEX "assignments_status_idx" ON "assignments"("status");

-- CreateIndex
CREATE INDEX "assignments_technicianId_scheduledStart_idx" ON "assignments"("technicianId", "scheduledStart");

-- CreateIndex
CREATE INDEX "scheduling_runs_runType_idx" ON "scheduling_runs"("runType");

-- CreateIndex
CREATE INDEX "scheduling_runs_status_idx" ON "scheduling_runs"("status");

-- CreateIndex
CREATE INDEX "scheduling_runs_createdAt_idx" ON "scheduling_runs"("createdAt");

-- CreateIndex
CREATE INDEX "scheduling_run_details_schedulingRunId_idx" ON "scheduling_run_details"("schedulingRunId");

-- CreateIndex
CREATE INDEX "scheduling_run_details_jobId_idx" ON "scheduling_run_details"("jobId");

-- CreateIndex
CREATE INDEX "scheduling_run_details_selectedTechnicianId_idx" ON "scheduling_run_details"("selectedTechnicianId");

-- CreateIndex
CREATE INDEX "disruption_events_eventType_idx" ON "disruption_events"("eventType");

-- CreateIndex
CREATE INDEX "disruption_events_recoveryStatus_idx" ON "disruption_events"("recoveryStatus");

-- CreateIndex
CREATE INDEX "disruption_events_technicianId_idx" ON "disruption_events"("technicianId");

-- CreateIndex
CREATE INDEX "disruption_events_jobId_idx" ON "disruption_events"("jobId");

-- CreateIndex
CREATE INDEX "technician_unavailabilities_technicianId_idx" ON "technician_unavailabilities"("technicianId");

-- CreateIndex
CREATE INDEX "technician_unavailabilities_startTime_endTime_idx" ON "technician_unavailabilities"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_idempotencyKey_key" ON "idempotency_records"("idempotencyKey");

-- CreateIndex
CREATE INDEX "idempotency_records_operationType_idx" ON "idempotency_records"("operationType");

-- CreateIndex
CREATE INDEX "idempotency_records_createdAt_idx" ON "idempotency_records"("createdAt");
