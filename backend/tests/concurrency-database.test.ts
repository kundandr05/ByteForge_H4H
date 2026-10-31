import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/config/prisma';
import { transactionService } from '../src/services/transaction.service';
import { randomUUID } from 'crypto';

describe('Phase 11: Database Concurrency, Locking, and Integrity Validation', () => {
  beforeEach(async () => {
    // Clean test records in safe order
    await prisma.assignment.deleteMany({});
    await prisma.technicianUnavailability.deleteMany({});
    await prisma.disruptionEvent.deleteMany({});
    await prisma.idempotencyRecord.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.technician.deleteMany({});
  });

  // -------------------------------------------------------------
  // TEST 1: Atomic Rollback on Midway Failure
  // -------------------------------------------------------------
  it('1. guarantees 100% atomic rollback with zero orphan records when a transaction fails midway', async () => {
    const tech = await prisma.technician.create({
      data: {
        name: 'Atomic Bob',
        email: 'atomic.bob@dispatchgrid.io',
        phone: '+1-555-0101',
        skills: JSON.stringify(['ELECTRICAL']),
        serviceZones: JSON.stringify(['ZONE_NORTH']),
        latitude: 37.77,
        longitude: -122.41,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      },
    });

    const job = await prisma.job.create({
      data: {
        customerName: 'Rollback Client',
        description: 'Wiring check',
        requiredSkills: JSON.stringify(['ELECTRICAL']),
        priority: 'HIGH',
        estimatedDuration: 60,
        latitude: 37.771,
        longitude: -122.411,
        serviceZone: 'ZONE_NORTH',
        earliestStart: new Date('2026-11-02T08:00:00.000Z'),
        latestEnd: new Date('2026-11-02T16:00:00.000Z'),
        slaDeadline: new Date('2026-11-02T15:00:00.000Z'),
        status: 'PENDING',
      },
    });

    // Attempt a transaction that creates an assignment then throws an intentional failure
    await expect(
      transactionService.executeWithRetry(async (tx) => {
        // Step 1: Create assignment
        await tx.assignment.create({
          data: {
            jobId: job.id,
            technicianId: tech.id,
            scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
            scheduledEnd: new Date('2026-11-02T09:30:00.000Z'),
            travelTime: 10,
            status: 'SCHEDULED',
          },
        });

        // Step 2: Update job status
        await tx.job.update({
          where: { id: job.id },
          data: { status: 'ASSIGNED' },
        });

        // Step 3: Intentional midway explosion
        throw new Error('SIMULATED_TRANSACTION_FAILURE_MIDWAY');
      })
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE_MIDWAY');

    // VERIFICATION: Neither assignment exists nor job status changed
    const assignmentsCount = await prisma.assignment.count({ where: { jobId: job.id } });
    expect(assignmentsCount).toBe(0);

    const jobAfter = await prisma.job.findUnique({ where: { id: job.id } });
    expect(jobAfter?.status).toBe('PENDING'); // strictly un-mutated
  });

  // -------------------------------------------------------------
  // TEST 2: Concurrent Writers with Automated Backoff Retry
  // -------------------------------------------------------------
  it('2. successfully executes 8 concurrent transactional updates without SQLite lock errors', async () => {
    // Create 8 distinct jobs
    const jobs = [];
    for (let i = 0; i < 8; i++) {
      const j = await prisma.job.create({
        data: {
          customerName: `Concurrent Client ${i}`,
          description: `Work order ${i}`,
          requiredSkills: JSON.stringify(['HVAC']),
          priority: 'MEDIUM',
          estimatedDuration: 45,
          latitude: 37.77,
          longitude: -122.41,
          serviceZone: 'ZONE_CENTRAL',
          earliestStart: new Date('2026-11-02T08:00:00.000Z'),
          latestEnd: new Date('2026-11-02T17:00:00.000Z'),
          slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
          status: 'PENDING',
        },
      });
      jobs.push(j);
    }

    // Concurrently execute transactions updating each job
    const updatePromises = jobs.map((j, index) =>
      transactionService.executeWithRetry(
        async (tx) => {
          return tx.job.update({
            where: { id: j.id },
            data: {
              status: 'ASSIGNED',
              description: `Concurrently updated work order ${index}`,
            },
          });
        },
        { operationName: `CONCURRENT_JOB_UPDATE_${index}`, maxRetries: 5, baseDelayMs: 50 }
      )
    );

    const results = await Promise.all(updatePromises);
    expect(results.length).toBe(8);

    // Verify all 8 updates committed properly
    const updatedCount = await prisma.job.count({
      where: { status: 'ASSIGNED' },
    });
    expect(updatedCount).toBe(8);
  });

  // -------------------------------------------------------------
  // TEST 3: Idempotency Key Collision and Deduplication
  // -------------------------------------------------------------
  it('3. enforces uniqueness of idempotency keys under concurrent race conditions', async () => {
    const key = `race-idempotency-${randomUUID()}`;

    // Concurrently try to register the exact same idempotency key
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        transactionService.executeWithRetry(async (tx) => {
          return tx.idempotencyRecord.create({
            data: {
              idempotencyKey: key,
              operationType: 'OPTIMIZE_SCHEDULE',
              responseStatus: 201,
              responseBody: JSON.stringify({ runId: `run-${i}`, success: true }),
            },
          });
        })
      )
    );

    // Exactly 1 must have fulfilled, and the rest rejected with unique constraint violation
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);

    const countInDb = await prisma.idempotencyRecord.count({
      where: { idempotencyKey: key },
    });
    expect(countInDb).toBe(1);
  });

  // -------------------------------------------------------------
  // TEST 4: Foreign Key and Cascade Integrity
  // -------------------------------------------------------------
  it('4. preserves relational integrity and cascades child records safely', async () => {
    const tech = await prisma.technician.create({
      data: {
        name: 'Cascade Tech',
        email: 'cascade.tech@dispatchgrid.io',
        phone: '+1-555-0102',
        skills: JSON.stringify(['PLUMBING']),
        serviceZones: JSON.stringify(['ZONE_WEST']),
        latitude: 37.77,
        longitude: -122.41,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      },
    });

    // Create an unavailability record linked to tech
    const unavail = await prisma.technicianUnavailability.create({
      data: {
        technicianId: tech.id,
        startTime: new Date('2026-11-02T12:00:00.000Z'),
        endTime: new Date('2026-11-02T13:00:00.000Z'),
        reason: 'Lunch break',
      },
    });

    expect(unavail.id).toBeDefined();

    // Verify deleting technician cascades to their unavailability record
    await prisma.technician.delete({
      where: { id: tech.id },
    });

    const unavailAfter = await prisma.technicianUnavailability.findUnique({
      where: { id: unavail.id },
    });
    expect(unavailAfter).toBeNull();
  });

  // -------------------------------------------------------------
  // TEST 5: Concurrent Technician Availability Toggles
  // -------------------------------------------------------------
  it('5. handles rapid interleaved availability status mutations without lock starvation', async () => {
    const tech = await prisma.technician.create({
      data: {
        name: 'Interleaved Tech',
        email: 'interleaved@dispatchgrid.io',
        phone: '+1-555-0103',
        skills: JSON.stringify(['HVAC']),
        serviceZones: JSON.stringify(['ZONE_EAST']),
        latitude: 37.77,
        longitude: -122.41,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      },
    });

    const statuses = ['ON_SHIFT', 'AVAILABLE', 'UNAVAILABLE', 'AVAILABLE', 'OFF_DUTY'];

    for (const status of statuses) {
      await transactionService.executeWithRetry(async (tx) => {
        return tx.technician.update({
          where: { id: tech.id },
          data: { availabilityStatus: status },
        });
      });
    }

    const finalTech = await prisma.technician.findUnique({ where: { id: tech.id } });
    expect(finalTech?.availabilityStatus).toBe('OFF_DUTY');
  });
});
