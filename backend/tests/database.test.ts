import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/config/prisma';
import {
  technicianCreateSchema,
  jobCreateSchema,
  assignmentCreateSchema,
  technicianUnavailabilityCreateSchema,
} from '../src/validators/schemas';

describe('Phase 2 Database Architecture & Data Integrity', () => {
  beforeEach(async () => {
    // Clean database before each test
    await prisma.schedulingRunDetail.deleteMany({});
    await prisma.schedulingRun.deleteMany({});
    await prisma.assignment.deleteMany({});
    await prisma.technicianUnavailability.deleteMany({});
    await prisma.disruptionEvent.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.technician.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.idempotencyRecord.deleteMany({});
  });

  // 1. Database Connection
  it('1. verifies SQLite database connection probe', async () => {
    const probe = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    expect(probe).toBeDefined();
    expect(probe.length).toBeGreaterThan(0);
    expect(Number(probe[0].ok)).toBe(1);
  });

  // 2. Prisma Model Relationships
  it('2. verifies Prisma model relationships between Technician, Job, and Assignment', async () => {
    const technician = await prisma.technician.create({
      data: {
        name: 'Sarah Connor',
        email: 'sarah.connor@dispatchgrid.io',
        phone: '+1-555-0101',
        skills: JSON.stringify(['HVAC', 'REFRIGERATION']),
        serviceZones: JSON.stringify(['ZONE_NORTH', 'ZONE_CENTRAL']),
        latitude: 37.7749,
        longitude: -122.4194,
        shiftStart: '08:00',
        shiftEnd: '17:00',
      },
    });

    const job = await prisma.job.create({
      data: {
        customerName: 'Apex Data Center',
        description: 'Chiller compressor cooling failure emergency',
        requiredSkills: JSON.stringify(['HVAC']),
        priority: 'CRITICAL',
        estimatedDuration: 120,
        latitude: 37.7833,
        longitude: -122.4167,
        serviceZone: 'ZONE_NORTH',
        earliestStart: new Date('2026-10-31T09:00:00Z'),
        latestEnd: new Date('2026-10-31T15:00:00Z'),
        slaDeadline: new Date('2026-10-31T14:00:00Z'),
        status: 'ASSIGNED',
      },
    });

    const assignment = await prisma.assignment.create({
      data: {
        jobId: job.id,
        technicianId: technician.id,
        scheduledStart: new Date('2026-10-31T09:30:00Z'),
        scheduledEnd: new Date('2026-10-31T11:30:00Z'),
        travelTime: 25,
        status: 'SCHEDULED',
      },
      include: {
        job: true,
        technician: true,
      },
    });

    expect(assignment.job.id).toBe(job.id);
    expect(assignment.technician.id).toBe(technician.id);
    expect(assignment.technician.name).toBe('Sarah Connor');
    expect(assignment.job.customerName).toBe('Apex Data Center');
  });

  // 3. Job Creation
  it('3. creates a Job with complete operational attributes and valid status', async () => {
    const createdJob = await prisma.job.create({
      data: {
        customerName: 'BioHealth Labs',
        description: 'Autoclave electrical sensor calibration',
        requiredSkills: JSON.stringify(['ELECTRICAL', 'CALIBRATION']),
        priority: 'HIGH',
        estimatedDuration: 90,
        latitude: 37.7699,
        longitude: -122.4469,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: new Date('2026-10-31T10:00:00Z'),
        latestEnd: new Date('2026-10-31T18:00:00Z'),
        slaDeadline: new Date('2026-10-31T17:00:00Z'),
        status: 'PENDING',
      },
    });

    expect(createdJob.id).toBeDefined();
    expect(createdJob.customerName).toBe('BioHealth Labs');
    expect(createdJob.priority).toBe('HIGH');
    expect(createdJob.status).toBe('PENDING');
    expect(createdJob.estimatedDuration).toBe(90);

    const parsedSkills = JSON.parse(createdJob.requiredSkills);
    expect(parsedSkills).toEqual(['ELECTRICAL', 'CALIBRATION']);
  });

  // 4. Technician Creation
  it('4. creates a Technician with JSON array skills, service zones, and shift schedule', async () => {
    const technician = await prisma.technician.create({
      data: {
        name: 'Marcus Vance',
        email: 'marcus.vance@dispatchgrid.io',
        phone: '+1-555-0102',
        skills: JSON.stringify(['ELECTRICAL', 'HIGH_VOLTAGE']),
        serviceZones: JSON.stringify(['ZONE_EAST', 'ZONE_SOUTH']),
        latitude: 37.7558,
        longitude: -122.4208,
        shiftStart: '07:00',
        shiftEnd: '15:30',
        availabilityStatus: 'AVAILABLE',
      },
    });

    expect(technician.id).toBeDefined();
    expect(technician.email).toBe('marcus.vance@dispatchgrid.io');
    expect(technician.availabilityStatus).toBe('AVAILABLE');

    const skills = JSON.parse(technician.skills);
    const zones = JSON.parse(technician.serviceZones);
    expect(skills).toContain('HIGH_VOLTAGE');
    expect(zones).toContain('ZONE_SOUTH');
  });

  // 5. Assignment Relationships
  it('5. queries assignments with related Technician and Job metadata', async () => {
    const tech = await prisma.technician.create({
      data: {
        name: 'Elena Rostova',
        email: 'elena.rostova@dispatchgrid.io',
        phone: '+1-555-0103',
        skills: JSON.stringify(['PLUMBING', 'PUMPS']),
        serviceZones: JSON.stringify(['ZONE_WEST']),
        latitude: 37.765,
        longitude: -122.435,
        shiftStart: '09:00',
        shiftEnd: '18:00',
      },
    });

    const job = await prisma.job.create({
      data: {
        customerName: 'Grand Hotel Bay',
        description: 'Main pump water flow pressure sensor alert',
        requiredSkills: JSON.stringify(['PUMPS']),
        priority: 'MEDIUM',
        estimatedDuration: 60,
        latitude: 37.766,
        longitude: -122.436,
        serviceZone: 'ZONE_WEST',
        earliestStart: new Date('2026-10-31T11:00:00Z'),
        latestEnd: new Date('2026-10-31T16:00:00Z'),
        slaDeadline: new Date('2026-10-31T15:00:00Z'),
        status: 'ASSIGNED',
      },
    });

    await prisma.assignment.create({
      data: {
        jobId: job.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-10-31T11:30:00Z'),
        scheduledEnd: new Date('2026-10-31T12:30:00Z'),
        travelTime: 15,
        status: 'SCHEDULED',
      },
    });

    const technicianWithAssignments = await prisma.technician.findUnique({
      where: { id: tech.id },
      include: {
        assignments: {
          include: { job: true },
        },
      },
    });

    expect(technicianWithAssignments?.assignments.length).toBe(1);
    expect(technicianWithAssignments?.assignments[0].job.customerName).toBe('Grand Hotel Bay');
    expect(technicianWithAssignments?.assignments[0].travelTime).toBe(15);
  });

  // 6. Unique Constraints
  it('6. enforces unique constraint on Technician email', async () => {
    const techData = {
      name: 'Duplicate Check User',
      email: 'unique.test@dispatchgrid.io',
      phone: '+1-555-0199',
      skills: JSON.stringify(['GENERAL']),
      serviceZones: JSON.stringify(['ZONE_ALL']),
      latitude: 37.77,
      longitude: -122.42,
      shiftStart: '08:00',
      shiftEnd: '16:00',
    };

    // First creation must succeed
    await prisma.technician.create({ data: techData });

    // Second creation with identical email must be rejected by Prisma unique constraint (P2002)
    await expect(
      prisma.technician.create({
        data: {
          ...techData,
          name: 'Another User',
        },
      })
    ).rejects.toThrow();
  });

  // 7. Foreign Key Behavior & Cascades
  it('7. verifies foreign key cascade deletion: deleting Job deletes its Assignments', async () => {
    const tech = await prisma.technician.create({
      data: {
        name: 'Cascade Test Tech',
        email: 'cascade.tech@dispatchgrid.io',
        phone: '+1-555-0188',
        skills: JSON.stringify(['SOLAR']),
        serviceZones: JSON.stringify(['ZONE_NORTH']),
        latitude: 37.78,
        longitude: -122.41,
        shiftStart: '08:00',
        shiftEnd: '16:00',
      },
    });

    const job = await prisma.job.create({
      data: {
        customerName: 'Solar Array Site 4',
        description: 'Inverter diagnostics',
        requiredSkills: JSON.stringify(['SOLAR']),
        priority: 'MEDIUM',
        estimatedDuration: 60,
        latitude: 37.781,
        longitude: -122.411,
        serviceZone: 'ZONE_NORTH',
        earliestStart: new Date('2026-10-31T08:00:00Z'),
        latestEnd: new Date('2026-10-31T12:00:00Z'),
        slaDeadline: new Date('2026-10-31T11:00:00Z'),
      },
    });

    const assignment = await prisma.assignment.create({
      data: {
        jobId: job.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-10-31T08:30:00Z'),
        scheduledEnd: new Date('2026-10-31T09:30:00Z'),
        travelTime: 10,
      },
    });

    expect(await prisma.assignment.count({ where: { id: assignment.id } })).toBe(1);

    // Delete Job - should cascade to delete Assignment
    await prisma.job.delete({ where: { id: job.id } });

    // Verify Assignment was deleted
    const remainingAssignment = await prisma.assignment.findUnique({
      where: { id: assignment.id },
    });
    expect(remainingAssignment).toBeNull();

    // Verify Technician still exists
    const existingTech = await prisma.technician.findUnique({ where: { id: tech.id } });
    expect(existingTech).not.toBeNull();
  });

  // 8. Invalid Data Rejection
  it('8. rejects invalid records via Zod schemas (coordinates, duration, time inversions)', () => {
    // A. Invalid Latitude (> 90)
    const invalidCoordsResult = technicianCreateSchema.safeParse({
      name: 'Invalid Lat User',
      email: 'invalid.lat@test.com',
      phone: '+1-555-0000',
      skills: ['HVAC'],
      serviceZones: ['ZONE_1'],
      latitude: 195.0, // Invalid: exceeds 90
      longitude: -122.4,
      shiftStart: '08:00',
      shiftEnd: '17:00',
    });
    expect(invalidCoordsResult.success).toBe(false);

    // B. Negative Estimated Duration
    const negativeDurationResult = jobCreateSchema.safeParse({
      customerName: 'Negative Duration Corp',
      description: 'Test Job',
      requiredSkills: ['HVAC'],
      priority: 'HIGH',
      estimatedDuration: -45, // Invalid: must be positive
      latitude: 37.77,
      longitude: -122.41,
      serviceZone: 'ZONE_1',
      earliestStart: new Date('2026-10-31T08:00:00Z'),
      latestEnd: new Date('2026-10-31T12:00:00Z'),
      slaDeadline: new Date('2026-10-31T11:00:00Z'),
    });
    expect(negativeDurationResult.success).toBe(false);

    // C. Time Inversion: earliestStart after latestEnd
    const invertedTimeResult = jobCreateSchema.safeParse({
      customerName: 'Inverted Times Corp',
      description: 'Test Job',
      requiredSkills: ['HVAC'],
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.77,
      longitude: -122.41,
      serviceZone: 'ZONE_1',
      earliestStart: new Date('2026-10-31T14:00:00Z'),
      latestEnd: new Date('2026-10-31T10:00:00Z'), // Invalid: before earliestStart
      slaDeadline: new Date('2026-10-31T16:00:00Z'),
    });
    expect(invertedTimeResult.success).toBe(false);

    // D. Identical Shift Start & End
    const identicalShiftResult = technicianCreateSchema.safeParse({
      name: 'Zero Shift Tech',
      email: 'zero.shift@test.com',
      phone: '+1-555-0000',
      skills: ['HVAC'],
      serviceZones: ['ZONE_1'],
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '08:00', // Invalid: identical
    });
    expect(identicalShiftResult.success).toBe(false);

    // E. Assignment Inverted Start & End
    const invertedAssignmentResult = assignmentCreateSchema.safeParse({
      jobId: '123e4567-e89b-12d3-a456-426614174000',
      technicianId: '123e4567-e89b-12d3-a456-426614174001',
      scheduledStart: new Date('2026-10-31T12:00:00Z'),
      scheduledEnd: new Date('2026-10-31T11:00:00Z'), // Invalid: before start
      travelTime: 10,
    });
    expect(invertedAssignmentResult.success).toBe(false);

    // F. Technician Unavailability Inverted
    const invertedUnavailResult = technicianUnavailabilityCreateSchema.safeParse({
      technicianId: '123e4567-e89b-12d3-a456-426614174000',
      startTime: new Date('2026-10-31T18:00:00Z'),
      endTime: new Date('2026-10-31T12:00:00Z'), // Invalid: before startTime
      reason: 'Medical Leave',
    });
    expect(invertedUnavailResult.success).toBe(false);
  });

  // 9. Idempotency Key Uniqueness
  it('9. enforces uniqueness of idempotency keys in IdempotencyRecord', async () => {
    const key = 'req_idempotency_dispatch_test_key_001';

    await prisma.idempotencyRecord.create({
      data: {
        idempotencyKey: key,
        operationType: 'OPTIMIZE_SCHEDULE',
        responseStatus: 200,
        responseBody: JSON.stringify({ assignedCount: 15, unassignedCount: 0 }),
      },
    });

    // Attempting to insert identical idempotency key must reject
    await expect(
      prisma.idempotencyRecord.create({
        data: {
          idempotencyKey: key,
          operationType: 'OPTIMIZE_SCHEDULE',
          responseStatus: 200,
          responseBody: JSON.stringify({ assignedCount: 10 }),
        },
      })
    ).rejects.toThrow();
  });

  // 10. Scheduling Run History Persistence
  it('10. persists SchedulingRun and historical SchedulingRunDetail records with explanations', async () => {
    const tech = await prisma.technician.create({
      data: {
        name: 'David Ortiz',
        email: 'david.ortiz@dispatchgrid.io',
        phone: '+1-555-0144',
        skills: JSON.stringify(['HVAC', 'CONTROLS']),
        serviceZones: JSON.stringify(['ZONE_METRO']),
        latitude: 37.77,
        longitude: -122.42,
        shiftStart: '08:00',
        shiftEnd: '17:00',
      },
    });

    const job = await prisma.job.create({
      data: {
        customerName: 'Civic Tower 12',
        description: 'BMS controller alert',
        requiredSkills: JSON.stringify(['CONTROLS']),
        priority: 'HIGH',
        estimatedDuration: 75,
        latitude: 37.775,
        longitude: -122.425,
        serviceZone: 'ZONE_METRO',
        earliestStart: new Date('2026-10-31T09:00:00Z'),
        latestEnd: new Date('2026-10-31T14:00:00Z'),
        slaDeadline: new Date('2026-10-31T13:00:00Z'),
      },
    });

    // Create Scheduling Run
    const run = await prisma.schedulingRun.create({
      data: {
        runType: 'OPTIMIZATION',
        status: 'COMPLETED',
        objectiveScore: 94.5,
        totalJobs: 1,
        assignedJobs: 1,
        unassignedJobs: 0,
        totalTravelTime: 18,
        slaViolations: 0,
        technicianUtilization: 88.2,
        completedAt: new Date(),
      },
    });

    // Create Scheduling Run Detail preserving decision history
    await prisma.schedulingRunDetail.create({
      data: {
        schedulingRunId: run.id,
        jobId: job.id,
        selectedTechnicianId: tech.id,
        previousTechnicianId: null,
        scheduledStart: new Date('2026-10-31T09:30:00Z'),
        scheduledEnd: new Date('2026-10-31T10:45:00Z'),
        assignmentStatus: 'ASSIGNED',
        explanation: 'Selected technician David Ortiz due to closest proximity and 100% skill match',
        rejectionReasons: JSON.stringify([
          { candidateId: 'tech_002', reason: 'Skill mismatch: lacks CONTROLS certification' },
          { candidateId: 'tech_003', reason: 'Shift overrun: estimated completion exceeds shiftEnd' },
        ]),
      },
    });

    // Query run with historical details
    const savedRun = await prisma.schedulingRun.findUnique({
      where: { id: run.id },
      include: {
        details: {
          include: {
            job: true,
            selectedTechnician: true,
          },
        },
      },
    });

    expect(savedRun).not.toBeNull();
    expect(savedRun?.details.length).toBe(1);

    const detail = savedRun!.details[0];
    expect(detail.job.customerName).toBe('Civic Tower 12');
    expect(detail.selectedTechnician?.name).toBe('David Ortiz');
    expect(detail.assignmentStatus).toBe('ASSIGNED');
    expect(detail.explanation).toContain('David Ortiz');

    const rejectionReasons = JSON.parse(detail.rejectionReasons as string);
    expect(rejectionReasons.length).toBe(2);
    expect(rejectionReasons[0].reason).toContain('Skill mismatch');
  });
});
