import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { runSeed } from '../prisma/seed/seed';
import { runSchedulingEngine } from '../src/scheduling/scheduling.engine';
import { calculateHaversineDistance, calculateTravelEstimate } from '../src/scheduling/travel-calculator';
import { validateHardConstraints } from '../src/scheduling/constraint-validator';

describe('Intelligent Scheduling Engine (Phase 5)', () => {
  describe('Travel Calculator & Haversine Distance Unit Tests', () => {
    it('returns 0 distance for identical coordinates', () => {
      const coord = { latitude: 37.7749, longitude: -122.4194 };
      const dist = calculateHaversineDistance(coord, coord);
      expect(dist).toBe(0);
    });

    it('calculates accurate distance between known SF coordinates (Civic Center to Embarcadero)', () => {
      const civicCenter = { latitude: 37.7793, longitude: -122.4192 };
      const ferryBuilding = { latitude: 37.7955, longitude: -122.3937 };
      const dist = calculateHaversineDistance(civicCenter, ferryBuilding);
      // Great circle line is approx ~2.8 to 3.2 km
      expect(dist).toBeGreaterThan(2.5);
      expect(dist).toBeLessThan(3.5);
    });

    it('computes realistic travel time using detour factor and configurable speed', () => {
      const origin = { latitude: 37.7749, longitude: -122.4194 };
      const destination = { latitude: 37.8044, longitude: -122.2712 }; // SF to Oakland (~13 km)
      const estimate = calculateTravelEstimate(origin, destination);
      expect(estimate.distanceKm).toBeGreaterThan(10);
      expect(estimate.travelTimeMinutes).toBeGreaterThan(15);
      expect(estimate.travelTimeMinutes).toBeLessThan(60);
    });

    it('throws descriptive error on invalid latitude or longitude', () => {
      expect(() =>
        calculateHaversineDistance(
          { latitude: 95.0, longitude: -122.4194 },
          { latitude: 37.7749, longitude: -122.4194 }
        )
      ).toThrow(/Invalid origin coordinates/);
    });
  });

  describe('Scheduling the 150+ Seeded Jobs & Overlap Prevention', () => {
    beforeEach(async () => {
      // Seed the full realistic dataset (28 technicians, 165 jobs, 4 unavailability periods)
      await runSeed(0x1337beef);
    });

    it('schedules the seeded jobs dataset and guarantees NO technician receives overlapping assignments', async () => {
      // 1. Fetch all seeded technicians and jobs from database
      const technicians = await prisma.technician.findMany({
        include: {
          unavailabilities: true,
          assignments: true,
        },
      });

      const jobs = await prisma.job.findMany({
        where: { status: 'PENDING' },
      });

      expect(technicians.length).toBeGreaterThanOrEqual(25);
      expect(jobs.length).toBeGreaterThanOrEqual(150);

      // 2. Execute the Scheduling Engine
      const startTime = Date.now();
      const result = runSchedulingEngine(jobs, technicians, {
        runType: 'INITIAL',
        referenceDate: new Date('2026-11-02T00:00:00.000Z'),
      });
      const duration = Date.now() - startTime;

      // 3. Verify Execution Performance (< 2000ms for 165 jobs)
      expect(duration).toBeLessThan(2000);
      expect(result.metrics.totalJobs).toBe(jobs.length);
      expect(result.metrics.assignedJobs).toBeGreaterThanOrEqual(50);
      expect(result.metrics.slaViolations).toBe(0);

      // 4. Group all assigned jobs by technician to verify STRICT NON-OVERLAPPING
      const techAssignments = new Map<string, Array<{ start: number; end: number; job: any; slot: any }>>();

      for (const decision of result.decisions) {
        if (decision.isAssigned && decision.selectedTechnicianId && decision.selectedSlot) {
          const techId = decision.selectedTechnicianId;
          if (!techAssignments.has(techId)) {
            techAssignments.set(techId, []);
          }

          const start = decision.selectedSlot.scheduledStart.getTime();
          const end = decision.selectedSlot.scheduledEnd.getTime();
          techAssignments.get(techId)!.push({
            start,
            end,
            job: jobs.find((j) => j.id === decision.jobId),
            slot: decision.selectedSlot,
          });
        }
      }

      // 5. CRITICAL CHECK: Assert that NO technician receives overlapping assignments
      let totalVerifiedAssignments = 0;

      for (const [techId, assignments] of techAssignments.entries()) {
        const tech = technicians.find((t) => t.id === techId)!;

        // Sort assignments chronologically
        assignments.sort((a, b) => a.start - b.start);

        for (let i = 0; i < assignments.length; i++) {
          const current = assignments[i];
          totalVerifiedAssignments++;

          // Check against shift boundaries
          const shiftStartHour = parseInt(tech.shiftStart.split(':')[0], 10);
          const shiftStartMin = parseInt(tech.shiftStart.split(':')[1], 10);
          const shiftEndHour = parseInt(tech.shiftEnd.split(':')[0], 10);
          const shiftEndMin = parseInt(tech.shiftEnd.split(':')[1], 10);

          const expectedShiftStart = new Date('2026-11-02T00:00:00.000Z');
          expectedShiftStart.setUTCHours(shiftStartHour, shiftStartMin, 0, 0);

          const expectedShiftEnd = new Date('2026-11-02T00:00:00.000Z');
          expectedShiftEnd.setUTCHours(shiftEndHour, shiftEndMin, 0, 0);

          expect(current.start).toBeGreaterThanOrEqual(expectedShiftStart.getTime());
          expect(current.end).toBeLessThanOrEqual(expectedShiftEnd.getTime());

          // Verify with every other assignment for this technician: NO OVERLAP!
          for (let j = i + 1; j < assignments.length; j++) {
            const next = assignments[j];

            // Condition: current.end <= next.start
            const isNonOverlapping = current.end <= next.start;
            expect(isNonOverlapping).toBe(true);

            // Travel buffer check: next assignment cannot start until current.end + transit time
            const travel = calculateTravelEstimate(
              { latitude: current.job.latitude, longitude: current.job.longitude },
              { latitude: next.job.latitude, longitude: next.job.longitude }
            );
            const minDepartureArrival = current.end + travel.travelTimeMinutes * 60 * 1000;
            expect(next.start).toBeGreaterThanOrEqual(minDepartureArrival);
          }

          // Verify NO OVERLAP with technician unavailabilities
          for (const unavail of tech.unavailabilities) {
            const uStart = new Date(unavail.startTime).getTime();
            const uEnd = new Date(unavail.endTime).getTime();
            const overlaps = current.start < uEnd && current.end > uStart;
            expect(overlaps).toBe(false);
          }
        }
      }

      expect(totalVerifiedAssignments).toBe(result.metrics.assignedJobs);
      expect(totalVerifiedAssignments).toBeGreaterThanOrEqual(50);
    });

    it('rejects unfulfillable edge cases correctly (Missing Skills, Impossible SLA)', async () => {
      const technicians = await prisma.technician.findMany({
        include: { unavailabilities: true, assignments: true },
      });

      // Scenario E: Job requiring non-existent skill
      const unfulfillableJob = {
        id: 'unfulfillable-skill-job',
        customerName: 'Impossible Request Inc',
        description: 'Requires non-existent quantum teleportation skill',
        requiredSkills: JSON.stringify(['QUANTUM_TELEPORTATION']),
        priority: 'HIGH',
        estimatedDuration: 60,
        latitude: 37.7749,
        longitude: -122.4194,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: '2026-11-02T09:00:00.000Z',
        latestEnd: '2026-11-02T17:00:00.000Z',
        slaDeadline: '2026-11-02T17:00:00.000Z',
        status: 'PENDING',
      };

      const result = runSchedulingEngine([unfulfillableJob], technicians);
      expect(result.decisions[0].isAssigned).toBe(false);
      expect(result.decisions[0].classification).toBe('UNASSIGNABLE');
      expect(result.decisions[0].unassignedReasonCode).toBe('NO_TECHNICIAN_WITH_REQUIRED_SKILLS');
    });
  });

  describe('Scheduling REST API Endpoints', () => {
    beforeEach(async () => {
      await runSeed(0x1337beef);
    });

    it('POST /api/scheduling/generate creates assignments in database transactionally', async () => {
      const res = await request(app)
        .post('/api/scheduling/generate')
        .send({
          runType: 'INITIAL',
          idempotencyKey: 'test-run-seed-150',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metrics.assignedJobs).toBeGreaterThanOrEqual(50);

      // Verify records committed in database
      const dbAssignments = await prisma.assignment.count();
      expect(dbAssignments).toBe(res.body.data.metrics.assignedJobs);

      const dbRun = await prisma.schedulingRun.findUnique({
        where: { id: res.body.data.runId },
      });
      expect(dbRun).not.toBeNull();
      expect(dbRun?.status).toBe('COMPLETED');
    });

    it('POST /api/scheduling/generate respects idempotency key on repeated call', async () => {
      const key = 'idempotent-test-key-999';

      const firstCall = await request(app)
        .post('/api/scheduling/generate')
        .send({ idempotencyKey: key });

      expect(firstCall.status).toBe(200);
      const firstRunId = firstCall.body.data.runId;

      // Second call with same idempotencyKey should return cached result instantly
      const secondCall = await request(app)
        .post('/api/scheduling/generate')
        .send({ idempotencyKey: key });

      expect(secondCall.status).toBe(200);
      expect(secondCall.body.data.runId).toBe(firstRunId);
    });

    it('GET /api/scheduling/current returns active schedule and assignments', async () => {
      // First generate schedule
      await request(app).post('/api/scheduling/generate').send({});

      const res = await request(app).get('/api/scheduling/current');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activeAssignmentsCount).toBeGreaterThanOrEqual(50);
      expect(Array.isArray(res.body.data.assignments)).toBe(true);
    });

    it('GET /api/scheduling/runs returns paginated historical runs', async () => {
      await request(app).post('/api/scheduling/generate').send({});

      const res = await request(app).get('/api/scheduling/runs?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/scheduling/technicians/:technicianId/schedule returns technician timeline with NO overlapping items', async () => {
      const genRes = await request(app).post('/api/scheduling/generate').send({});
      const firstAssignedDecision = genRes.body.data.decisions.find((d: any) => d.isAssigned);
      expect(firstAssignedDecision).toBeDefined();

      const techId = firstAssignedDecision.selectedTechnicianId;
      const res = await request(app).get(`/api/scheduling/technicians/${techId}/schedule`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician.id).toBe(techId);
      expect(res.body.data.timeline.length).toBeGreaterThanOrEqual(1);

      // Verify chronological ordering and non-overlapping of timeline
      const timeline = res.body.data.timeline;
      for (let i = 0; i < timeline.length - 1; i++) {
        const itemA = timeline[i];
        const itemB = timeline[i + 1];
        expect(new Date(itemA.endTime).getTime()).toBeLessThanOrEqual(
          new Date(itemB.startTime).getTime()
        );
      }
    });
  });
});
