import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { runSeed } from '../prisma/seed/seed';
import { schedulingService } from '../src/scheduling/scheduling.service';
import { runOptimizationEngine } from '../src/optimization/optimization.engine';
import { evaluateScheduleState } from '../src/optimization/optimization.objective';
import { compareSchedules } from '../src/optimization/schedule-comparator';
import { analyzeWorkloadDistribution } from '../src/optimization/workload-balancer';

describe('Assignment Optimization Engine (Phase 6)', () => {
  beforeEach(async () => {
    // Fresh deterministic seed (28 technicians, 165 jobs, 0 assignments)
    await runSeed(0x1337beef);
  });

  describe('Unit Tests: Objective Function & Workload Balancer', () => {
    it('evaluates schedule state with consistent score direction (higher is better)', () => {
      const mockTech = {
        id: 'tech-1',
        name: 'Alex Tech',
        skills: JSON.stringify(['HVAC']),
        serviceZones: JSON.stringify(['ZONE_CENTRAL']),
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      };

      const mockJob = {
        id: 'job-1',
        customerName: 'Acme Corp',
        priority: 'HIGH',
        estimatedDuration: 60,
        serviceZone: 'ZONE_CENTRAL',
        slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      };

      const mockAssignment = {
        jobId: 'job-1',
        technicianId: 'tech-1',
        scheduledStart: new Date('2026-11-02T09:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T10:00:00.000Z'),
        travelTimeMinutes: 15,
        travelDistanceKm: 10,
        job: mockJob,
        status: 'SCHEDULED',
      };

      const metrics = evaluateScheduleState({
        assignments: [mockAssignment],
        allJobs: [mockJob],
        technicians: [mockTech],
      });

      expect(metrics.qualityScore).toBeGreaterThan(0);
      expect(metrics.qualityScore).toBeLessThanOrEqual(100);
      expect(metrics.slaViolations).toBe(0);
      expect(metrics.lateJobs).toBe(0);
      expect(metrics.scoreBreakdown.slaLatenessScore).toBe(1.0);
    });

    it('penalizes SLA violations and late jobs heavily in objective score', () => {
      const mockTech = {
        id: 'tech-1',
        name: 'Alex Tech',
        skills: '["HVAC"]',
        serviceZones: '["ZONE_CENTRAL"]',
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      };

      const onTimeJob = {
        id: 'job-1',
        customerName: 'Acme OnTime',
        priority: 'MEDIUM',
        estimatedDuration: 60,
        slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      };

      const lateJob = {
        id: 'job-2',
        customerName: 'Acme Late',
        priority: 'MEDIUM',
        estimatedDuration: 60,
        slaDeadline: new Date('2026-11-02T09:30:00.000Z'), // Deadline is 09:30, but finishes at 10:00
      };

      const onTimeMetrics = evaluateScheduleState({
        assignments: [
          {
            jobId: 'job-1',
            technicianId: 'tech-1',
            scheduledStart: new Date('2026-11-02T09:00:00.000Z'),
            scheduledEnd: new Date('2026-11-02T10:00:00.000Z'),
            travelTimeMinutes: 15,
            travelDistanceKm: 10,
            job: onTimeJob,
            status: 'SCHEDULED',
          },
        ],
        allJobs: [onTimeJob],
        technicians: [mockTech],
      });

      const lateMetrics = evaluateScheduleState({
        assignments: [
          {
            jobId: 'job-2',
            technicianId: 'tech-1',
            scheduledStart: new Date('2026-11-02T09:00:00.000Z'),
            scheduledEnd: new Date('2026-11-02T10:00:00.000Z'), // Late!
            travelTimeMinutes: 15,
            travelDistanceKm: 10,
            job: lateJob,
            status: 'SCHEDULED',
          },
        ],
        allJobs: [lateJob],
        technicians: [mockTech],
      });

      expect(lateMetrics.slaViolations).toBe(1);
      expect(lateMetrics.qualityScore).toBeLessThan(onTimeMetrics.qualityScore);
    });

    it('calculates workload distribution and variance correctly', () => {
      const technicians = [
        { id: 't1', name: 'Tech 1', shiftStart: '08:00', shiftEnd: '16:00', availabilityStatus: 'AVAILABLE' },
        { id: 't2', name: 'Tech 2', shiftStart: '08:00', shiftEnd: '16:00', availabilityStatus: 'AVAILABLE' },
      ];

      const assignments = [
        {
          jobId: 'j1',
          technicianId: 't1',
          scheduledStart: new Date('2026-11-02T08:00:00.000Z'),
          scheduledEnd: new Date('2026-11-02T10:00:00.000Z'),
          travelTimeMinutes: 10,
          travelDistanceKm: 5,
          job: { estimatedDuration: 120 },
          status: 'SCHEDULED',
        },
      ];

      const report = analyzeWorkloadDistribution(assignments, technicians);
      expect(report.technicians.length).toBe(2);
      expect(report.meanWorkloadMinutes).toBe(60);
      expect(report.spreadMinutes).toBe(120);
    });
  });

  describe('Optimization Operations & Protected Job Safeguards', () => {
    it('strictly protects COMPLETED and IN_PROGRESS assignments from any modifications', () => {
      const tech1 = {
        id: 'tech-1',
        name: 'Tech One',
        skills: '["HVAC"]',
        serviceZones: '["ZONE_CENTRAL"]',
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      };

      const tech2 = {
        id: 'tech-2',
        name: 'Tech Two',
        skills: '["HVAC"]',
        serviceZones: '["ZONE_CENTRAL"]',
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      };

      const completedJob = {
        id: 'job-completed',
        customerName: 'Completed Customer',
        priority: 'HIGH',
        estimatedDuration: 60,
        serviceZone: 'ZONE_CENTRAL',
        requiredSkills: '["HVAC"]',
        earliestStart: '2026-11-02T08:00:00.000Z',
        latestEnd: '2026-11-02T12:00:00.000Z',
        slaDeadline: '2026-11-02T12:00:00.000Z',
      };

      const inProgressJob = {
        id: 'job-in-progress',
        customerName: 'In Progress Customer',
        priority: 'HIGH',
        estimatedDuration: 60,
        serviceZone: 'ZONE_CENTRAL',
        requiredSkills: '["HVAC"]',
        earliestStart: '2026-11-02T10:00:00.000Z',
        latestEnd: '2026-11-02T14:00:00.000Z',
        slaDeadline: '2026-11-02T14:00:00.000Z',
      };

      const initialAssignments = [
        {
          jobId: 'job-completed',
          technicianId: 'tech-1',
          scheduledStart: new Date('2026-11-02T08:00:00.000Z'),
          scheduledEnd: new Date('2026-11-02T09:00:00.000Z'),
          travelTime: 10,
          job: completedJob,
          status: 'COMPLETED',
        },
        {
          jobId: 'job-in-progress',
          technicianId: 'tech-1',
          scheduledStart: new Date('2026-11-02T09:30:00.000Z'),
          scheduledEnd: new Date('2026-11-02T10:30:00.000Z'),
          travelTime: 15,
          job: inProgressJob,
          status: 'IN_PROGRESS',
        },
      ];

      const result = runOptimizationEngine(
        initialAssignments,
        [completedJob, inProgressJob],
        [tech1, tech2],
        { maxIterations: 10 }
      );

      // Verify neither job was modified
      const optCompleted = result.optimizedAssignments.find((a) => a.jobId === 'job-completed')!;
      const optInProgress = result.optimizedAssignments.find((a) => a.jobId === 'job-in-progress')!;

      expect(optCompleted.technicianId).toBe('tech-1');
      expect(optCompleted.scheduledStart.toISOString()).toBe('2026-11-02T08:00:00.000Z');
      expect(optInProgress.technicianId).toBe('tech-1');
      expect(optInProgress.scheduledStart.toISOString()).toBe('2026-11-02T09:30:00.000Z');
      expect(result.changes.length).toBe(0);
    });

    it('guarantees the optimized quality score is at least as good as the baseline score', async () => {
      // First generate baseline schedule from seeded jobs
      await schedulingService.generateSchedule({ runType: 'INITIAL' });

      // Run optimization engine
      const current = await schedulingService.getCurrentSchedule();
      const allJobs = await prisma.job.findMany();
      const technicians = await prisma.technician.findMany({
        include: { unavailabilities: true },
      });

      const optResult = runOptimizationEngine(
        current.assignments,
        allJobs,
        technicians,
        { maxIterations: 20 }
      );

      expect(optResult.optimizedMetrics.qualityScore).toBeGreaterThanOrEqual(
        optResult.baselineMetrics.qualityScore
      );
      expect(optResult.comparison.isImproved).toBe(true);
      expect(optResult.optimizedMetrics.slaViolations).toBe(0);
    });
  });

  describe('Optimization REST API Endpoints', () => {
    beforeEach(async () => {
      // Seed and generate baseline schedule
      await schedulingService.generateSchedule({ runType: 'INITIAL' });
    });

    it('POST /api/optimization/preview evaluates optimization in-memory without database mutations', async () => {
      const beforeAssignmentCount = await prisma.assignment.count();
      const beforeRunCount = await prisma.schedulingRun.count();

      const res = await request(app)
        .post('/api/optimization/preview')
        .send({
          maxIterations: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.baselineMetrics).toBeDefined();
      expect(res.body.data.optimizedMetrics).toBeDefined();
      expect(res.body.data.comparison).toBeDefined();

      // Database records MUST NOT change during a preview!
      const afterAssignmentCount = await prisma.assignment.count();
      const afterRunCount = await prisma.schedulingRun.count();
      expect(afterAssignmentCount).toBe(beforeAssignmentCount);
      expect(afterRunCount).toBe(beforeRunCount);
    });

    it('POST /api/optimization/run commits optimization transactionally to database', async () => {
      const res = await request(app)
        .post('/api/optimization/run')
        .send({
          maxIterations: 15,
          idempotencyKey: 'test-opt-run-001',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.runId).toBeDefined();
      expect(res.body.data.optimizedMetrics.qualityScore).toBeGreaterThanOrEqual(
        res.body.data.baselineMetrics.qualityScore
      );

      // Verify SchedulingRun with runType OPTIMIZATION was created in DB
      const optRun = await prisma.schedulingRun.findUnique({
        where: { id: res.body.data.runId },
      });
      expect(optRun).not.toBeNull();
      expect(optRun?.runType).toBe('OPTIMIZATION');
      expect(optRun?.status).toBe('COMPLETED');
    });

    it('POST /api/optimization/run respects idempotency key on repeated call', async () => {
      const key = 'idempotent-opt-key-777';

      const firstCall = await request(app)
        .post('/api/optimization/run')
        .send({ idempotencyKey: key, maxIterations: 5 });

      expect(firstCall.status).toBe(200);
      const firstRunId = firstCall.body.data.runId;

      const secondCall = await request(app)
        .post('/api/optimization/run')
        .send({ idempotencyKey: key, maxIterations: 5 });

      expect(secondCall.status).toBe(200);
      expect(secondCall.body.data.runId).toBe(firstRunId);
    });

    it('GET /api/optimization/runs retrieves paginated historical optimization runs', async () => {
      // Execute an optimization run first
      await request(app).post('/api/optimization/run').send({});

      const res = await request(app).get('/api/optimization/runs?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].runType).toBe('OPTIMIZATION');
    });

    it('GET /api/optimization/runs/:id retrieves run details by UUID', async () => {
      const runRes = await request(app).post('/api/optimization/run').send({});
      const runId = runRes.body.data.runId;

      const res = await request(app).get(`/api/optimization/runs/${runId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(runId);
      expect(res.body.data.runType).toBe('OPTIMIZATION');
      expect(Array.isArray(res.body.data.details)).toBe(true);
    });

    it('GET /api/optimization/runs/:id/comparison retrieves before-and-after comparison', async () => {
      const runRes = await request(app).post('/api/optimization/run').send({});
      const runId = runRes.body.data.runId;

      const res = await request(app).get(`/api/optimization/runs/${runId}/comparison`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.runId).toBe(runId);
      expect(res.body.data.comparison).toBeDefined();
    });

    it('GET /api/optimization/runs/:id/changes retrieves modified assignments audit', async () => {
      const runRes = await request(app).post('/api/optimization/run').send({});
      const runId = runRes.body.data.runId;

      const res = await request(app).get(`/api/optimization/runs/${runId}/changes`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.runId).toBe(runId);
      expect(Array.isArray(res.body.data.changes)).toBe(true);
    });
  });
});
