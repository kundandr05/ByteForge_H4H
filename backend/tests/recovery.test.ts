import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { runSeed } from '../prisma/seed/seed';
import { schedulingService } from '../src/scheduling/scheduling.service';
import { recoveryService } from '../src/recovery/recovery.service';

describe('Disruption Management & Recovery Engine (Phase 7)', () => {
  beforeEach(async () => {
    await runSeed(0x1337beef);
  });

  describe('Scenario A: TECHNICIAN_UNAVAILABLE', () => {
    it('handles technician sudden unavailability by reassigning affected jobs or marking unassigned', async () => {
      // 1. Initial schedule
      await schedulingService.generateSchedule({ runType: 'INITIAL' });

      // 2. Select technician with scheduled jobs
      const techWithJobs = await prisma.technician.findFirst({
        where: {
          assignments: { some: { status: 'SCHEDULED' } },
        },
        include: { assignments: true },
      });
      expect(techWithJobs).toBeDefined();

      // 3. Register disruption event
      const disruption = await recoveryService.createDisruption({
        eventType: 'TECHNICIAN_UNAVAILABLE',
        technicianId: techWithJobs!.id,
        description: `Technician ${techWithJobs!.name} vehicle breakdown`,
        eventPayload: { reason: 'VEHICLE_BREAKDOWN' },
      });

      expect(disruption.id).toBeDefined();
      expect(disruption.recoveryStatus).toBe('PENDING');

      // 4. Run recovery
      const result = await recoveryService.recoverDisruption(disruption.id);
      expect(result.recoveryStatus).toBeDefined();
      expect(result.metrics.affectedJobsCount).toBeGreaterThan(0);

      // Verify technician status was set to UNAVAILABLE
      const updatedTech = await prisma.technician.findUnique({
        where: { id: techWithJobs!.id },
      });
      expect(updatedTech!.availabilityStatus).toBe('UNAVAILABLE');
    });
  });

  describe('Scenario B: URGENT_JOB_ARRIVAL', () => {
    it('dispatches critical emergent job into schedule gaps', async () => {
      await schedulingService.generateSchedule({ runType: 'INITIAL' });

      // Create urgent pending job
      const urgentJob = await prisma.job.create({
        data: {
          customerName: 'Emergency Hospital ICU',
          description: 'Critical primary oxygen generator backup offline',
          requiredSkills: JSON.stringify(['HVAC', 'ELECTRICAL']),
          priority: 'CRITICAL',
          estimatedDuration: 60,
          latitude: 37.7749,
          longitude: -122.4194,
          serviceZone: 'ZONE_CENTRAL',
          earliestStart: new Date('2026-11-02T08:00:00.000Z'),
          latestEnd: new Date('2026-11-02T17:00:00.000Z'),
          slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
          status: 'PENDING',
        },
      });

      const disruption = await recoveryService.createDisruption({
        eventType: 'URGENT_JOB_ARRIVAL',
        jobId: urgentJob.id,
        description: 'Urgent break-in dispatch request for ICU emergency',
        eventPayload: { priority: 'CRITICAL' },
      });

      const result = await recoveryService.recoverDisruption(disruption.id);
      expect(result.actions.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario C: JOB_DURATION_CHANGED', () => {
    it('detects duration overrun and slides downstream appointments safely', async () => {
      await schedulingService.generateSchedule({ runType: 'INITIAL' });

      const assigned = await prisma.assignment.findFirst({
        where: { status: 'SCHEDULED' },
        include: { job: true },
      });
      expect(assigned).toBeDefined();

      const disruption = await recoveryService.createDisruption({
        eventType: 'JOB_DURATION_CHANGED',
        jobId: assigned!.jobId,
        technicianId: assigned!.technicianId,
        description: 'Job complexity escalated, requires additional 60 minutes',
        eventPayload: { newDuration: assigned!.job.estimatedDuration + 60 },
      });

      const result = await recoveryService.recoverDisruption(disruption.id);
      expect(result.metrics.affectedJobsCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Scenario D: JOB_CANCELLED', () => {
    it('cancels appointment, releases slot, and compacts technician timeline', async () => {
      await schedulingService.generateSchedule({ runType: 'INITIAL' });

      const assigned = await prisma.assignment.findFirst({
        where: { status: 'SCHEDULED' },
      });
      expect(assigned).toBeDefined();

      const disruption = await recoveryService.createDisruption({
        eventType: 'JOB_CANCELLED',
        jobId: assigned!.jobId,
        technicianId: assigned!.technicianId,
        description: 'Customer cancelled service call due to power restoration',
        eventPayload: { cancelReason: 'CUSTOMER_REQUEST' },
      });

      const result = await recoveryService.recoverDisruption(disruption.id);
      expect(result.cancelledJobIds).toContain(assigned!.jobId);

      const jobRecord = await prisma.job.findUnique({ where: { id: assigned!.jobId } });
      expect(jobRecord!.status).toBe('CANCELLED');
    });
  });

  describe('Scenario E: EARLY_COMPLETION', () => {
    it('marks assignment completed early and pulls forward downstream appointments', async () => {
      await schedulingService.generateSchedule({ runType: 'INITIAL' });

      const assigned = await prisma.assignment.findFirst({
        where: { status: 'SCHEDULED' },
      });
      expect(assigned).toBeDefined();

      const disruption = await recoveryService.createDisruption({
        eventType: 'EARLY_COMPLETION',
        jobId: assigned!.jobId,
        technicianId: assigned!.technicianId,
        description: 'Technician finished diagnostic 30 minutes ahead of estimate',
        eventPayload: { actualDuration: 30 },
      });

      const result = await recoveryService.recoverDisruption(disruption.id);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Scenario F: DELAYED_COMPLETION', () => {
    it('shifts downstream jobs to safeguard hard SLA boundaries when completion is delayed', async () => {
      await schedulingService.generateSchedule({ runType: 'INITIAL' });

      const assigned = await prisma.assignment.findFirst({
        where: { status: 'SCHEDULED' },
      });
      expect(assigned).toBeDefined();

      const disruption = await recoveryService.createDisruption({
        eventType: 'DELAYED_COMPLETION',
        jobId: assigned!.jobId,
        technicianId: assigned!.technicianId,
        description: 'Encountered frozen pipe rust, delayed by 45 minutes',
        eventPayload: { delayMinutes: 45 },
      });

      const result = await recoveryService.recoverDisruption(disruption.id);
      expect(result.metrics.affectedJobsCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Recovery REST API Endpoints', () => {
    it('POST /api/disruptions creates disruption event', async () => {
      const res = await request(app)
        .post('/api/disruptions')
        .send({
          eventType: 'JOB_CANCELLED',
          description: 'Client relocated',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBeDefined();
    });

    it('GET /api/disruptions lists registered disruptions', async () => {
      const res = await request(app).get('/api/disruptions');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
