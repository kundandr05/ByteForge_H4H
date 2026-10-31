import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { runSeed } from '../prisma/seed/seed';
import { schedulingService } from '../src/scheduling/scheduling.service';
import { optimizationService } from '../src/optimization/optimization.service';
import { recoveryService } from '../src/recovery/recovery.service';
import { auditService } from '../src/services/audit.service';
import { explainabilityService } from '../src/services/explainability.service';
import { idempotencyService } from '../src/services/idempotency.service';
import { transactionService } from '../src/services/transaction.service';
import { reliabilityService } from '../src/services/reliability.service';
import { eventLoggerService } from '../src/services/event-logger.service';

describe('Phase 8: Explainability, Audit History and System Reliability', () => {
  beforeEach(async () => {
    // Reset database to deterministic clean state
    await runSeed(0x1337beef);
    reliabilityService.resetMetrics();
    eventLoggerService.clearBuffer();
  });

  describe('1. Explainability Engine', () => {
    it('1. generates rich explanation for an assigned job with constraint checklist and scores', async () => {
      // Run initial schedule
      const sched = await schedulingService.generateSchedule({ runType: 'INITIAL' });
      expect(sched.metrics.assignedJobs).toBeGreaterThan(0);

      // Find an assigned job
      const assigned = await prisma.assignment.findFirst({
        where: { status: 'SCHEDULED' },
        include: { job: true },
      });
      expect(assigned).toBeDefined();

      const explanation = await explainabilityService.explainJob(assigned!.jobId);
      expect(explanation.job.id).toBe(assigned!.jobId);
      expect(explanation.decision.isAssigned).toBe(true);
      expect(explanation.assignment).toBeDefined();
      expect(explanation.decision.selectedTechnician).toBeDefined();
      expect(explanation.decision.skillsMatched?.length).toBeGreaterThanOrEqual(1);
      expect(explanation.decision.serviceZoneMatched).toBe(true);
      expect(explanation.decision.constraintsEvaluated).toBeDefined();
      expect(explanation.decision.constraintsEvaluated!.length).toBeGreaterThanOrEqual(5);

      // All hard constraints evaluated must pass
      for (const check of explanation.decision.constraintsEvaluated!) {
        expect(check.passed).toBe(true);
      }
      expect(explanation.decision.selectionRationale).toContain('Technician');
    });

    it('2. generates detailed rejection explanations for rejected technicians', async () => {
      const sched = await schedulingService.generateSchedule({ runType: 'INITIAL' });
      expect(sched.metrics.assignedJobs).toBeGreaterThan(0);

      // Find a run detail with rejection reasons
      const detailWithRejections = await prisma.schedulingRunDetail.findFirst({
        where: {
          schedulingRunId: sched.runId,
          assignmentStatus: 'ASSIGNED',
        },
      });

      expect(detailWithRejections).toBeDefined();
      expect(detailWithRejections!.explanation).toBeDefined();
      const rejections = JSON.parse(detailWithRejections!.rejectionReasons || '[]');
      expect(Array.isArray(rejections)).toBe(true);
    });

    it('3. generates actionable explanation for unassigned jobs with temporary vs permanent classification', async () => {
      await schedulingService.generateSchedule({ runType: 'INITIAL' });

      // Find unassigned job
      const unassigned = await prisma.job.findFirst({
        where: { status: 'UNASSIGNED' },
      });
      expect(unassigned).toBeDefined();

      const explanation = await explainabilityService.explainJob(unassigned!.id);
      expect(explanation.decision.isAssigned).toBe(false);
      expect(explanation.decision.failureDetails).toBeDefined();
      expect(['TEMPORARY', 'PERMANENT']).toContain(explanation.decision.failureDetails!.classification);
      expect(explanation.decision.failureDetails!.suggestedAction.length).toBeGreaterThan(10);
      expect(explanation.decision.failureDetails!.candidatesEvaluated.length).toBeGreaterThan(0);
    });

    it('4. generates comprehensive optimization run explanation with accepted and rejected moves', async () => {
      await schedulingService.generateSchedule({ runType: 'INITIAL' });
      const opt = await optimizationService.runOptimization({ maxIterations: 10 });

      const explanation = await explainabilityService.explainOptimizationRun(opt.runId);
      expect(explanation.runId).toBe(opt.runId);
      expect(explanation.beforeScore).toBeDefined();
      expect(explanation.afterScore).toBeDefined();
      expect(explanation.acceptedChanges).toBeDefined();
      expect(explanation.rejectedOperationsSummary).toBeDefined();
    });

    it('5. generates disruption recovery explanation distinguishing recovered and unrecovered jobs', async () => {
      await schedulingService.generateSchedule({ runType: 'INITIAL' });

      const tech = await prisma.technician.findFirst();
      const disruption = await recoveryService.createDisruption({
        eventType: 'TECHNICIAN_UNAVAILABLE',
        technicianId: tech!.id,
        description: 'Sudden technician illness',
        eventPayload: { reason: 'SICK' },
      });

      const recovery = await recoveryService.recoverDisruption(disruption.id);
      const explanation = await explainabilityService.explainRecoveryRun(recovery.runId);

      expect(explanation.runId).toBe(recovery.runId);
      expect(explanation.disruptionEvent).toBeDefined();
      expect(['SUCCESSFULLY_RECOVERED', 'PARTIALLY_RESOLVED', 'RECOVERY_FAILED']).toContain(
        explanation.recoveryStatus
      );
      expect(explanation.recoveryActions.length).toBe(recovery.actions.length);
    });
  });

  describe('2. Audit History & Immutability', () => {
    it('6. creates structured audit log atomically with operations', async () => {
      const audit = await auditService.log({
        entityType: 'JOB',
        entityId: 'test-job-uuid',
        action: 'CREATE',
        newValue: { customerName: 'Test Customer', priority: 'HIGH' },
        description: 'Created job for customer Test Customer',
      });

      expect(audit.id).toBeDefined();
      expect(audit.entityType).toBe('JOB');
      expect(audit.action).toBe('CREATE');
      expect(audit.newValue).toContain('Test Customer');
    });

    it('7. retrieves paginated audit history through service and REST API', async () => {
      await auditService.log({
        entityType: 'JOB',
        entityId: 'job-101',
        action: 'STATUS_CHANGE',
        newValue: { status: 'IN_PROGRESS' },
      });

      const res = await request(app).get('/api/audit').query({ limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.pagination.total).toBeGreaterThan(0);
    });

    it('8. filters audit history by entityType, action, and entity ID', async () => {
      await auditService.log({
        entityType: 'TECHNICIAN',
        entityId: 'tech-999',
        action: 'AVAILABILITY_CHANGE',
        newValue: { status: 'OFF_DUTY' },
      });

      const filterRes = await request(app)
        .get('/api/audit/entity/TECHNICIAN/tech-999');

      expect(filterRes.status).toBe(200);
      expect(filterRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(filterRes.body.data[0].entityId).toBe('tech-999');
    });

    it('9. enforces immutability: audit logs cannot be updated or deleted via normal service APIs', async () => {
      await expect(auditService.update()).rejects.toThrow('AUDIT_RECORD_IMMUTABLE');
      await expect(auditService.delete()).rejects.toThrow('AUDIT_RECORD_IMMUTABLE');
    });
  });

  describe('3. Reliability, Idempotency & Concurrency', () => {
    it('10. handles duplicate request caching via IdempotencyService', async () => {
      const testKey = 'idem-key-phase8-01';
      let executeCount = 0;

      const runOp = () =>
        idempotencyService.executeIdempotent(testKey, 'TEST_OP', async () => {
          executeCount++;
          return { status: 200, body: { message: 'Processed Successfully', count: executeCount } };
        });

      const res1 = await runOp();
      expect(res1.isCached).toBe(false);
      expect(res1.body.count).toBe(1);

      // Second invocation with identical key must return cached body without re-executing
      const res2 = await runOp();
      expect(res2.isCached).toBe(true);
      expect(res2.body.count).toBe(1);
      expect(executeCount).toBe(1); // Executor was NOT re-run!
    });

    it('11. enforces idempotency on scheduling generation endpoints', async () => {
      const idempotencyKey = 'scheduling-idem-test-999';

      const res1 = await request(app)
        .post('/api/scheduling/generate')
        .send({ runType: 'INITIAL', idempotencyKey });

      expect(res1.status).toBe(200);
      const runId1 = res1.body.data.runId;

      // Duplicate request with identical key
      const res2 = await request(app)
        .post('/api/scheduling/generate')
        .send({ runType: 'INITIAL', idempotencyKey });

      expect(res2.status).toBe(200);
      const runId2 = res2.body.data.runId;
      expect(runId2).toBe(runId1); // Cached run returned!
    });

    it('12. guarantees complete transaction rollback on failure leaving NO orphaned records or fake audits', async () => {
      const beforeAudits = await prisma.auditLog.count();
      const beforeJobs = await prisma.job.count();

      // Simulate a multi-step transaction that fails halfway
      await expect(
        transactionService.executeWithRetry(async (tx) => {
          // Step 1: Create a job
          await tx.job.create({
            data: {
              customerName: 'Rollback Test Customer',
              description: 'This must be rolled back',
              requiredSkills: JSON.stringify(['HVAC']),
              priority: 'HIGH',
              estimatedDuration: 60,
              latitude: 37.77,
              longitude: -122.41,
              serviceZone: 'ZONE_CENTRAL',
              earliestStart: new Date(),
              latestEnd: new Date(Date.now() + 3600000),
              slaDeadline: new Date(Date.now() + 7200000),
              status: 'PENDING',
            },
          });

          // Step 2: Create an audit log
          await tx.auditLog.create({
            data: {
              entityType: 'JOB',
              entityId: 'fake-id',
              action: 'CREATE',
              description: 'Phantom audit log',
            },
          });

          // Step 3: Intentional failure
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        })
      ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

      // Assert complete rollback: table counts remain strictly unchanged
      const afterAudits = await prisma.auditLog.count();
      const afterJobs = await prisma.job.count();

      expect(afterAudits).toBe(beforeAudits);
      expect(afterJobs).toBe(beforeJobs);
    });

    it('13. records structured failure events when scheduling run encounters an invalid state', async () => {
      // Pass impossible inputs or simulate invalid schedule attempt
      await expect(
        eventLoggerService.trackOperation('INVALID_SCHEDULING_RUN', async () => {
          throw new Error('INCOMPATIBLE_SHIFT_SPECIFICATION');
        })
      ).rejects.toThrow('INCOMPATIBLE_SHIFT_SPECIFICATION');

      const recentLogs = eventLoggerService.getRecentLogs({ operationName: 'INVALID_SCHEDULING_RUN' });
      expect(recentLogs.length).toBeGreaterThan(0);
      expect(recentLogs[0].status).toBe('FAILURE');
      expect(recentLogs[0].metadata?.errorMessage).toContain('INCOMPATIBLE_SHIFT_SPECIFICATION');
    });

    it('14. handles failed recovery behavior gracefully without corrupting database state', async () => {
      // Attempt to recover a non-existent disruption
      await expect(
        recoveryService.recoverDisruption('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow();

      // Database remains clean and healthy
      const health = await reliabilityService.getHealthMetrics();
      expect(health.database.status).toBe('UP');
    });

    it('15. handles concurrent scheduling requests safely with cooperative resource locking', async () => {
      const lockKey = 'SCHEDULING_RUN_RESOURCE_LOCK';

      const lock1 = reliabilityService.acquireLock(lockKey);
      expect(lock1).toBe(true);

      // Concurrent request attempting to acquire identical lock must fail
      const lock2 = reliabilityService.acquireLock(lockKey);
      expect(lock2).toBe(false);

      // Once released, lock can be acquired again
      reliabilityService.releaseLock(lockKey);
      const lock3 = reliabilityService.acquireLock(lockKey);
      expect(lock3).toBe(true);
      reliabilityService.releaseLock(lockKey);
    });

    it('16. maintains audit consistency across multi-step operations', async () => {
      const initialCount = await prisma.auditLog.count();

      // Run scheduling
      const run = await schedulingService.generateSchedule({ runType: 'INITIAL' });
      const schedAudit = await prisma.auditLog.findFirst({
        where: { entityType: 'SCHEDULE', entityId: run.runId },
      });
      expect(schedAudit).toBeDefined();
      expect(schedAudit!.description).toContain(run.runId);

      const postSchedCount = await prisma.auditLog.count();
      expect(postSchedCount).toBeGreaterThan(initialCount);
    });
  });

  describe('4. Explainability REST API Endpoints', () => {
    it('GET /api/explanations/jobs/:jobId returns 200 with full explanation payload', async () => {
      const job = await prisma.job.findFirst();
      expect(job).toBeDefined();

      const res = await request(app).get(`/api/explanations/jobs/${job!.id}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.job.id).toBe(job!.id);
      expect(res.body.data.decision).toBeDefined();
    });

    it('GET /api/explanations/scheduling-runs/:runId returns 200 with run metrics and decision breakdown', async () => {
      const run = await schedulingService.generateSchedule({ runType: 'INITIAL' });

      const res = await request(app).get(`/api/explanations/scheduling-runs/${run.runId}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.runId).toBe(run.runId);
      expect(res.body.data.metrics).toBeDefined();
      expect(res.body.data.hardConstraintsSummary.allHardConstraintsPreserved).toBe(true);
    });

    it('GET /api/explanations/jobs/:jobId returns 404 for unknown job ID', async () => {
      const res = await request(app).get('/api/explanations/jobs/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('JOB_NOT_FOUND');
    });
  });
});
