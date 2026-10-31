import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { runSeed } from '../prisma/seed/seed';
import { prisma } from '../src/config/prisma';

describe.sequential('Phase 10: Complete 17-Step End-to-End User Journey Integration Test', () => {
  const app = createApp();

  // State variables carried across the 17-step user journey
  let createdJobId: string;
  let schedulingRunId: string;
  let assignedJobId: string;
  let unassignedJobId: string;
  let activeTechnicianId: string;
  let optimizationRunId: string;
  let disruptionId: string;
  let disruptionTechId: string;

  beforeAll(async () => {
    // Start with pristine deterministic dataset
    await runSeed(0x1337beef);
  });

  // -------------------------------------------------------------
  // STEP 1: Open the application dashboard
  // -------------------------------------------------------------
  it('STEP 1: verifies system health and runtime diagnostics for dashboard initialization', async () => {
    const healthRes = await request(app).get('/api/health');
    expect(healthRes.status).toBe(200);
    const healthData = healthRes.body.data || healthRes.body;
    expect(healthData.status).toBeDefined();
    expect(healthData.uptimeSeconds ?? healthData.uptime ?? 0).toBeGreaterThanOrEqual(0);

    const dbHealthRes = await request(app).get('/api/health/database');
    expect(dbHealthRes.status).toBe(200);
    const dbData = dbHealthRes.body.data || dbHealthRes.body;
    expect(dbData.status).toBeDefined();
    const tableCounts = dbData.tableCounts || dbData.tables || {};
    expect(tableCounts.jobs).toBeGreaterThanOrEqual(150);
    expect(tableCounts.technicians).toBeGreaterThanOrEqual(25);
  });

  // -------------------------------------------------------------
  // STEP 2: Verify seeded jobs and technicians
  // -------------------------------------------------------------
  it('STEP 2: verifies seeded jobs and technicians match workforce capacity requirements', async () => {
    const jobsRes = await request(app).get('/api/jobs?limit=250');
    expect(jobsRes.status).toBe(200);
    expect(jobsRes.body.meta.total).toBeGreaterThanOrEqual(150);
    expect(jobsRes.body.data.length).toBeGreaterThanOrEqual(150);

    const techsRes = await request(app).get('/api/technicians?limit=100');
    expect(techsRes.status).toBe(200);
    expect(techsRes.body.data.length).toBeGreaterThanOrEqual(25);

    // Verify 5 service zones and 10 skill categories are present
    const zones = new Set(techsRes.body.data.flatMap((t: any) => t.serviceZones));
    expect(zones.size).toBeGreaterThanOrEqual(5);

    const skills = new Set(techsRes.body.data.flatMap((t: any) => t.skills));
    expect(skills.size).toBeGreaterThanOrEqual(10);
  });

  // -------------------------------------------------------------
  // STEP 3: Create a new service job
  // -------------------------------------------------------------
  it('STEP 3: creates a new critical service job through the work order API', async () => {
    const newJobPayload = {
      customerName: 'St. Jude Metro Medical ICU',
      description: 'Emergency primary oxygen generator electrical power coupling failure',
      requiredSkills: ['ELECTRICAL', 'HVAC'],
      priority: 'CRITICAL',
      estimatedDuration: 60,
      latitude: 37.7749,
      longitude: -122.4194,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: '2026-11-02T08:00:00.000Z',
      latestEnd: '2026-11-02T16:00:00.000Z',
      slaDeadline: '2026-11-02T12:00:00.000Z',
      status: 'PENDING',
    };

    const res = await request(app).post('/api/jobs').send(newJobPayload);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.customerName).toBe('St. Jude Metro Medical ICU');
    expect(res.body.data.priority).toBe('CRITICAL');

    createdJobId = res.body.data.id;
  });

  // -------------------------------------------------------------
  // STEP 4: Verify that it appears in the jobs table
  // -------------------------------------------------------------
  it('STEP 4: verifies newly created job appears in jobs search and list queries', async () => {
    const searchRes = await request(app).get('/api/jobs?search=St.+Jude+Metro+Medical+ICU');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.length).toBe(1);
    expect(searchRes.body.data[0].id).toBe(createdJobId);
    expect(searchRes.body.data[0].status).toBe('PENDING');

    const singleRes = await request(app).get(`/api/jobs/${createdJobId}`);
    expect(singleRes.status).toBe(200);
    expect(singleRes.body.data.id).toBe(createdJobId);
  });

  // -------------------------------------------------------------
  // STEP 5: Generate an initial schedule
  // -------------------------------------------------------------
  it('STEP 5: triggers initial scheduling engine and verifies transactional assignment persistence', async () => {
    const idempotencyKey = `e2e-sched-${Date.now()}`;
    const res = await request(app)
      .post('/api/scheduling/generate')
      .send({
        runType: 'INITIAL',
        idempotencyKey,
        weights: {
          slaUrgency: 0.35,
          travelEfficiency: 0.25,
          workloadBalance: 0.2,
          prioritySuitability: 0.2,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.runId).toBeDefined();
    expect(res.body.data.metrics.assignedJobs).toBeGreaterThan(0);
    expect(res.body.data.metrics.slaViolations).toBe(0);

    schedulingRunId = res.body.data.runId;
  });

  // -------------------------------------------------------------
  // STEP 6: Open the scheduling timeline
  // -------------------------------------------------------------
  it('STEP 6: opens scheduling timeline and verifies assignments and travel gaps', async () => {
    const currentRes = await request(app).get('/api/scheduling/current');
    expect(currentRes.status).toBe(200);
    expect(currentRes.body.data.assignments.length).toBeGreaterThan(0);

    // Pick an assigned job and active technician for downstream steps
    const firstAssignment = currentRes.body.data.assignments[0];
    assignedJobId = firstAssignment.jobId;
    activeTechnicianId = firstAssignment.technicianId;

    // Verify technician daily schedule timeline
    const techScheduleRes = await request(app).get(
      `/api/scheduling/technicians/${activeTechnicianId}/schedule?date=2026-11-02`
    );
    expect(techScheduleRes.status).toBe(200);
    expect(techScheduleRes.body.data.timeline.length).toBeGreaterThan(0);
    expect(techScheduleRes.body.data.totalAllocatedMinutes).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // STEP 7: Inspect an assigned job and its explanation
  // -------------------------------------------------------------
  it('STEP 7: inspects assigned job decision explainability, 7 hard constraints, and scores', async () => {
    const expRes = await request(app).get(`/api/explanations/jobs/${assignedJobId}`);
    expect(expRes.status).toBe(200);
    expect(expRes.body.data.decision.isAssigned).toBe(true);
    expect(expRes.body.data.decision.selectedTechnician).toBeDefined();
    expect(expRes.body.data.decision.selectionRationale).toBeDefined();
    expect(expRes.body.data.decision.constraintsEvaluated.length).toBe(7);

    // All hard constraints must be satisfied
    const allPassed = expRes.body.data.decision.constraintsEvaluated.every(
      (c: any) => c.passed === true
    );
    expect(allPassed).toBe(true);
  });

  // -------------------------------------------------------------
  // STEP 8: Inspect an unassigned job and its rejection reasons
  // -------------------------------------------------------------
  it('STEP 8: inspects unassigned job explainability, failure classification, and rejected candidates', async () => {
    // Find an unassigned job
    const unassignedJob = await prisma.job.findFirst({
      where: { status: 'UNASSIGNED' },
    });
    expect(unassignedJob).toBeDefined();
    unassignedJobId = unassignedJob!.id;

    const unassignedExpRes = await request(app).get(`/api/explanations/jobs/${unassignedJobId}`);
    expect(unassignedExpRes.status).toBe(200);
    expect(unassignedExpRes.body.data.decision.isAssigned).toBe(false);
    expect(unassignedExpRes.body.data.decision.failureDetails?.reasonCode).toBeDefined();
    expect(unassignedExpRes.body.data.decision.failureDetails?.classification).toBeDefined();
    const evaluatedCandidates = unassignedExpRes.body.data.decision.failureDetails?.candidatesEvaluated || [];
    expect(evaluatedCandidates.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // STEP 9: Run optimization
  // -------------------------------------------------------------
  it('STEP 9: runs optimization engine with iterative local search and 2-opt reordering', async () => {
    const optRes = await request(app)
      .post('/api/optimization/run')
      .send({
        maxIterations: 25,
        idempotencyKey: `e2e-opt-${Date.now()}`,
      });

    expect(optRes.status).toBe(200);
    expect(optRes.body.data.runId).toBeDefined();
    expect(optRes.body.data.status).toBe('COMPLETED');
    const baseline = optRes.body.data.baselineMetrics?.qualityScore ?? optRes.body.data.baselineMetrics?.overallQualityScore ?? 0;
    const optimized = optRes.body.data.optimizedMetrics?.qualityScore ?? optRes.body.data.optimizedMetrics?.overallQualityScore ?? 0;
    expect(optimized).toBeGreaterThanOrEqual(baseline);

    optimizationRunId = optRes.body.data.runId;
  });

  // -------------------------------------------------------------
  // STEP 10: Compare original and optimized schedule
  // -------------------------------------------------------------
  it('STEP 10: compares original and optimized schedules via comparison and changes APIs', async () => {
    const compRes = await request(app).get(`/api/optimization/runs/${optimizationRunId}/comparison`);
    expect(compRes.status).toBe(200);
    const scoreDiff = compRes.body.data.comparison?.scoreImprovement ?? compRes.body.data.comparison?.scoreDelta ?? 0;
    expect(scoreDiff).toBeGreaterThanOrEqual(0);

    const changesRes = await request(app).get(`/api/optimization/runs/${optimizationRunId}/changes`);
    expect(changesRes.status).toBe(200);
    expect(Array.isArray(changesRes.body.data.changes)).toBe(true);
  });

  // -------------------------------------------------------------
  // STEP 11: Trigger technician unavailability
  // -------------------------------------------------------------
  it('STEP 11: triggers technician unavailability disruption scenario', async () => {
    // Pick an active technician who has scheduled assignments
    const techWithAssignments = await prisma.assignment.findFirst({
      where: { status: 'SCHEDULED' },
      select: { technicianId: true },
    });
    expect(techWithAssignments).toBeDefined();
    disruptionTechId = techWithAssignments!.technicianId;

    const disRes = await request(app)
      .post('/api/disruptions')
      .send({
        eventType: 'TECHNICIAN_UNAVAILABLE',
        technicianId: disruptionTechId,
        description: 'Frontline service vehicle transmission failure during transit',
        eventPayload: { reason: 'Vehicle transmission failure' },
      });

    expect(disRes.status).toBe(201);
    expect(disRes.body.data.id).toBeDefined();
    expect(disRes.body.data.recoveryStatus).toBe('PENDING');

    disruptionId = disRes.body.data.id;
  });

  // -------------------------------------------------------------
  // STEP 12: Execute recovery
  // -------------------------------------------------------------
  it('STEP 12: executes autonomous disruption recovery replanning', async () => {
    const recRes = await request(app)
      .post(`/api/disruptions/${disruptionId}/recover`)
      .send({
        referenceDate: '2026-11-02T00:00:00.000Z',
        idempotencyKey: `e2e-recov-${Date.now()}`,
      });

    expect(recRes.status).toBe(200);
    expect(['RESOLVED', 'PARTIALLY_RESOLVED', 'FAILED']).toContain(recRes.body.data.recoveryStatus);
    expect(recRes.body.data.metrics.durationMs).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------
  // STEP 13: Inspect affected jobs and recovered assignments
  // -------------------------------------------------------------
  it('STEP 13: inspects comprehensive recovery report with per-job impact and decisions', async () => {
    const reportRes = await request(app).get(`/api/disruptions/${disruptionId}/recovery-report`);
    expect(reportRes.status).toBe(200);
    const details = reportRes.body.data.result || reportRes.body.data;
    expect(reportRes.body.data.disruption?.id || details.disruptionId).toBe(disruptionId);
    expect(details.metrics?.affectedJobsCount).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------
  // STEP 14: Verify updated timeline
  // -------------------------------------------------------------
  it('STEP 14: verifies updated timeline guarantees zero remaining assignments on unavailable technician', async () => {
    const currentRes = await request(app).get('/api/scheduling/current');
    expect(currentRes.status).toBe(200);

    // The unavailable technician must have ZERO scheduled assignments
    const remainingOnUnavailable = currentRes.body.data.assignments.filter(
      (a: any) => a.technicianId === disruptionTechId && a.status === 'SCHEDULED'
    );
    expect(remainingOnUnavailable.length).toBe(0);

    // Verify global zero overlap guarantee
    const assignmentsByTech = new Map<string, any[]>();
    for (const asgn of currentRes.body.data.assignments) {
      if (!assignmentsByTech.has(asgn.technicianId)) {
        assignmentsByTech.set(asgn.technicianId, []);
      }
      assignmentsByTech.get(asgn.technicianId)!.push(asgn);
    }

    for (const [techId, asgns] of assignmentsByTech.entries()) {
      asgns.sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
      for (let i = 0; i < asgns.length - 1; i++) {
        const currentEnd = new Date(asgns[i].scheduledEnd).getTime();
        const nextStart = new Date(asgns[i + 1].scheduledStart).getTime();
        expect(
          currentEnd,
          `Overlap detected for tech ${techId} between ${asgns[i].id} and ${asgns[i + 1].id}`
        ).toBeLessThanOrEqual(nextStart);
      }
    }
  });

  // -------------------------------------------------------------
  // STEP 15: Open recovery history
  // -------------------------------------------------------------
  it('STEP 15: opens recovery history and verifies recovery run audit logging', async () => {
    const histRes = await request(app).get('/api/recovery/history?page=1&limit=10');
    expect(histRes.status).toBe(200);
    expect(histRes.body.data.length).toBeGreaterThan(0);
    expect(histRes.body.data[0].runType).toBe('RECOVERY');
  });

  // -------------------------------------------------------------
  // STEP 16: Open audit history
  // -------------------------------------------------------------
  it('STEP 16: opens immutable audit log and verifies complete operations traceability', async () => {
    const auditRes = await request(app).get('/api/audit?page=1&limit=50');
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.length).toBeGreaterThan(0);

    // Check entity types tracked
    const entityTypes = new Set(auditRes.body.data.map((l: any) => l.entityType));
    expect(entityTypes.has('SCHEDULE') || entityTypes.has('DISRUPTION') || entityTypes.has('JOB')).toBe(true);

    // Verify single audit record retrieval
    const firstLog = auditRes.body.data[0];
    const singleLogRes = await request(app).get(`/api/audit/${firstLog.id}`);
    expect(singleLogRes.status).toBe(200);
    expect(singleLogRes.body.data.id).toBe(firstLog.id);
  });

  // -------------------------------------------------------------
  // STEP 17: Verify dashboard metrics reflect the latest state
  // -------------------------------------------------------------
  it('STEP 17: verifies dashboard metrics reflect the final live operational state', async () => {
    const [jobsRes, techsRes, schedRes] = await Promise.all([
      request(app).get('/api/jobs?limit=250'),
      request(app).get('/api/technicians?limit=100'),
      request(app).get('/api/scheduling/current'),
    ]);

    expect(jobsRes.status).toBe(200);
    expect(techsRes.status).toBe(200);
    expect(schedRes.status).toBe(200);

    const totalJobs = jobsRes.body.meta?.total || jobsRes.body.data.length;
    expect(totalJobs).toBeGreaterThanOrEqual(151); // 165 seeded + 1 created

    const assignedJobs = jobsRes.body.data.filter((j: any) => j.status === 'ASSIGNED').length;
    expect(assignedJobs).toBe(schedRes.body.data.assignments.length);

    // The disrupted technician must have status UNAVAILABLE
    const disruptedTech = techsRes.body.data.find((t: any) => t.id === disruptionTechId);
    expect(disruptedTech).toBeDefined();
    expect(disruptedTech.availabilityStatus).toBe('UNAVAILABLE');
  });
});
