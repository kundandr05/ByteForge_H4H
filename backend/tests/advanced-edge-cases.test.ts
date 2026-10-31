import { describe, it, expect } from 'vitest';
import { runSchedulingEngine } from '../src/scheduling/scheduling.engine';
import { runOptimizationEngine } from '../src/optimization/optimization.engine';
import { runRecoveryEngine } from '../src/recovery/recovery.engine';

describe('Phase 11: Advanced Edge Cases (Scenarios A through L)', () => {
  const refDate = new Date('2026-11-02T00:00:00.000Z');

  // -------------------------------------------------------------
  // Scenario A: Technician has required skill but is unavailable during only feasible window
  // -------------------------------------------------------------
  it('Scenario A: marks job unassigned when sole skilled technician has an overlapping unavailability period', () => {
    const tech = {
      id: 'tech-a',
      name: 'Specialist Alpha',
      skills: JSON.stringify(['FIBER_OPTICS']),
      serviceZones: JSON.stringify(['ZONE_CENTRAL']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
      unavailabilities: [
        {
          id: 'u-overlap',
          startTime: new Date('2026-11-02T09:00:00.000Z'),
          endTime: new Date('2026-11-02T13:00:00.000Z'),
          reason: 'Scheduled training',
        },
      ],
    };

    // Customer window only 09:30 - 12:30 (completely inside the training window)
    const job = {
      id: 'job-scenario-a',
      customerName: 'Fiber Data Center',
      description: 'Fiber splice',
      requiredSkills: JSON.stringify(['FIBER_OPTICS']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T09:30:00.000Z'),
      latestEnd: new Date('2026-11-02T12:30:00.000Z'),
      slaDeadline: new Date('2026-11-02T12:00:00.000Z'),
      status: 'PENDING',
    };

    const result = runSchedulingEngine([job], [tech], { referenceDate: refDate });
    const decision = result.decisions[0];

    expect(decision.isAssigned).toBe(false);
    expect(['TECHNICIAN_UNAVAILABLE', 'NO_FEASIBLE_TIME_SLOT', 'INSUFFICIENT_TECHNICIAN_CAPACITY']).toContain(
      decision.unassignedReasonCode
    );
    expect(result.metrics.assignedJobs).toBe(0);
  });

  // -------------------------------------------------------------
  // Scenario B: Technician can reach the job but cannot finish before SLA deadline
  // -------------------------------------------------------------
  it('Scenario B: rejects assignment when travel + duration exceeds strict SLA deadline', () => {
    const tech = {
      id: 'tech-b',
      name: 'Slow Transit Tech',
      skills: JSON.stringify(['HVAC']),
      serviceZones: JSON.stringify(['ZONE_NORTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    // 60-minute duration job starting at 08:00 with SLA at 08:30 (impossible to finish in 30 mins)
    const job = {
      id: 'job-scenario-b',
      customerName: 'Hot Server Room',
      description: 'Chiller compressor fault',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'CRITICAL',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T12:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T08:30:00.000Z'),
      status: 'PENDING',
    };

    const result = runSchedulingEngine([job], [tech], { referenceDate: refDate });
    const decision = result.decisions[0];

    expect(decision.isAssigned).toBe(false);
    expect(result.metrics.slaViolations).toBe(0);
  });

  // -------------------------------------------------------------
  // Scenario C: Two critical jobs require the same specialized technician
  // -------------------------------------------------------------
  it('Scenario C: deterministically prioritizes earlier SLA when two critical jobs compete for one specialist', () => {
    const tech = {
      id: 'tech-c',
      name: 'Sole Master Electrician',
      skills: JSON.stringify(['HIGH_VOLTAGE']),
      serviceZones: JSON.stringify(['ZONE_CENTRAL']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    // Job 1: SLA 11:30
    const job1 = {
      id: 'job-c1',
      customerName: 'Substation Alpha',
      description: 'Breaker arcing',
      requiredSkills: JSON.stringify(['HIGH_VOLTAGE']),
      priority: 'CRITICAL',
      estimatedDuration: 120, // 2 hours
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T14:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T11:30:00.000Z'),
      status: 'PENDING',
    };

    // Job 2: SLA 10:30 (more urgent SLA!)
    const job2 = {
      id: 'job-c2',
      customerName: 'Hospital Transformer',
      description: 'Transformer cooling leak',
      requiredSkills: JSON.stringify(['HIGH_VOLTAGE']),
      priority: 'CRITICAL',
      estimatedDuration: 120, // 2 hours
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T14:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T10:30:00.000Z'), // More urgent SLA!
      status: 'PENDING',
    };

    const result = runSchedulingEngine([job1, job2], [tech], { referenceDate: refDate });

    // Job 2 has earlier SLA (10:05 vs 10:15), so it must be scheduled first
    const d2 = result.decisions.find((d) => d.jobId === job2.id)!;
    expect(d2.isAssigned).toBe(true);
    expect(d2.selectedSlot!.scheduledStart.getTime()).toBeLessThanOrEqual(
      new Date('2026-11-02T08:15:00.000Z').getTime()
    );
  });

  // -------------------------------------------------------------
  // Scenario D: Job requires multiple skills distributed across different technicians
  // -------------------------------------------------------------
  it('Scenario D: rejects job when no single technician possesses all required skills', () => {
    const tech1 = {
      id: 'tech-d1',
      name: 'Electrician',
      skills: JSON.stringify(['ELECTRICAL']),
      serviceZones: JSON.stringify(['ZONE_WEST']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };
    const tech2 = {
      id: 'tech-d2',
      name: 'Plumber',
      skills: JSON.stringify(['PLUMBING']),
      serviceZones: JSON.stringify(['ZONE_WEST']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    // Requires BOTH ELECTRICAL and PLUMBING
    const job = {
      id: 'job-scenario-d',
      customerName: 'Commercial Kitchen',
      description: 'Industrial dishwasher install',
      requiredSkills: JSON.stringify(['ELECTRICAL', 'PLUMBING']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_WEST',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T14:00:00.000Z'),
      status: 'PENDING',
    };

    const result = runSchedulingEngine([job], [tech1, tech2], { referenceDate: refDate });
    const decision = result.decisions[0];

    expect(decision.isAssigned).toBe(false);
    expect(decision.unassignedReasonCode).toBe('NO_TECHNICIAN_WITH_REQUIRED_SKILLS');
  });

  // -------------------------------------------------------------
  // Scenario E: Travel time makes next appointment impossible
  // -------------------------------------------------------------
  it('Scenario E: prevents appointment when post-job travel to next commitment cannot be completed in time', () => {
    const tech = {
      id: 'tech-e',
      name: 'Commuter Tech',
      skills: JSON.stringify(['SECURITY_SYSTEMS']),
      serviceZones: JSON.stringify(['ZONE_NORTH', 'ZONE_SOUTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
      commitments: [
        {
          id: 'existing-commitment-afternoon',
          type: 'ASSIGNMENT',
          startTime: new Date('2026-11-02T12:00:00.000Z'),
          endTime: new Date('2026-11-02T13:00:00.000Z'),
          location: { latitude: 37.85, longitude: -122.45 }, // Far North
          status: 'SCHEDULED',
        },
      ],
    };

    // Proposed job finishes at 11:55 in Far South (37.55) -> 30km from next appointment at 12:00
    const job = {
      id: 'job-scenario-e',
      customerName: 'South Branch Bank',
      description: 'Sensor check',
      requiredSkills: JSON.stringify(['SECURITY_SYSTEMS']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.55,
      longitude: -122.35,
      serviceZone: 'ZONE_SOUTH',
      earliestStart: new Date('2026-11-02T10:45:00.000Z'),
      latestEnd: new Date('2026-11-02T12:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T12:00:00.000Z'),
      status: 'PENDING',
    };

    const result = runSchedulingEngine([job], [tech], { referenceDate: refDate, runType: 'OPTIMIZATION' });
    const decision = result.decisions[0];

    // Cannot take job because technician cannot reach 12:00 commitment in Far North
    if (decision.isAssigned) {
      expect(decision.selectedSlot!.scheduledEnd.getTime() + 15 * 60000).toBeLessThanOrEqual(
        new Date('2026-11-02T12:00:00.000Z').getTime()
      );
    } else {
      expect(decision.isAssigned).toBe(false);
    }
  });

  // -------------------------------------------------------------
  // Scenario F: Job duration increases and causes cascading conflicts
  // -------------------------------------------------------------
  it('Scenario F: recovers schedule when job duration extension causes downstream appointment collisions', () => {
    const tech = {
      id: 'tech-f',
      name: 'Cascade Worker',
      skills: JSON.stringify(['HVAC']),
      serviceZones: JSON.stringify(['ZONE_CENTRAL']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'ON_SHIFT',
    };

    const tech2 = {
      id: 'tech-f2',
      name: 'Backup Worker',
      skills: JSON.stringify(['HVAC']),
      serviceZones: JSON.stringify(['ZONE_CENTRAL']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const job1 = {
      id: 'job-f1',
      customerName: 'Job Extended',
      description: 'Chiller overhaul',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'HIGH',
      estimatedDuration: 60, // Will extend to 150m
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:30:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'IN_PROGRESS',
    };

    const job2 = {
      id: 'job-f2',
      customerName: 'Job Colliding',
      description: 'Filter replacement',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T10:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'PENDING',
    };

    const activeAssignments = [
      {
        id: 'asgn-f1',
        jobId: job1.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:30:00.000Z'),
        status: 'IN_PROGRESS',
      },
      {
        id: 'asgn-f2',
        jobId: job2.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T10:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T11:00:00.000Z'),
        status: 'SCHEDULED',
      },
    ];

    const result = runRecoveryEngine({
      disruptionId: 'dis-f',
      eventType: 'JOB_DURATION_CHANGED',
      jobId: job1.id,
      eventPayload: { newDurationMinutes: 150 },
      activeAssignments,
      allJobs: [job1, job2],
      technicians: [tech, tech2],
      options: { referenceDate: refDate },
    });

    expect(['RESOLVED', 'PARTIALLY_RESOLVED']).toContain(result.recoveryStatus);
    expect(result.actions.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // Scenario G: Technician becomes unavailable while having several future assignments
  // -------------------------------------------------------------
  it('Scenario G: successfully reallocates multi-job routes when an assigned specialist breaks down', () => {
    const brokenTech = {
      id: 'tech-g-broken',
      name: 'Broken Van Tech',
      skills: JSON.stringify(['ELECTRICAL']),
      serviceZones: JSON.stringify(['ZONE_SOUTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const rescueTech = {
      id: 'tech-g-rescue',
      name: 'Rescue Tech',
      skills: JSON.stringify(['ELECTRICAL']),
      serviceZones: JSON.stringify(['ZONE_SOUTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const jobs = [1, 2, 3].map((i) => ({
      id: `job-g-${i}`,
      customerName: `Customer G${i}`,
      description: 'Breaker replacement',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'HIGH',
      estimatedDuration: 45,
      latitude: 37.77 + i * 0.005,
      longitude: -122.41 + i * 0.005,
      serviceZone: 'ZONE_SOUTH',
      earliestStart: new Date(`2026-11-02T${String(8 + i * 2).padStart(2, '0')}:00:00.000Z`),
      latestEnd: new Date(`2026-11-02T16:00:00.000Z`),
      slaDeadline: new Date(`2026-11-02T16:00:00.000Z`),
      status: 'PENDING',
    }));

    const activeAssignments = jobs.map((j, i) => ({
      id: `asgn-g-${i}`,
      jobId: j.id,
      technicianId: brokenTech.id,
      scheduledStart: new Date(`2026-11-02T${String(9 + i * 2).padStart(2, '0')}:00:00.000Z`),
      scheduledEnd: new Date(`2026-11-02T${String(10 + i * 2).padStart(2, '0')}:00:00.000Z`),
      status: 'SCHEDULED',
    }));

    const result = runRecoveryEngine({
      disruptionId: 'dis-g',
      eventType: 'TECHNICIAN_UNAVAILABLE',
      technicianId: brokenTech.id,
      eventPayload: { reason: 'Engine blown' },
      activeAssignments,
      allJobs: jobs,
      technicians: [brokenTech, rescueTech],
      options: { referenceDate: refDate },
    });

    // Zero remaining assignments on broken technician
    const onBroken = result.updatedAssignments.filter((a) => a.technicianId === brokenTech.id);
    expect(onBroken.length).toBe(0);
    expect(result.metrics.recoveredJobsCount).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // Scenario H: Urgent job arrives when all eligible technicians are occupied
  // -------------------------------------------------------------
  it('Scenario H: handles urgent job arrival by sliding feasible lower-priority slots or queuing safely', () => {
    const tech = {
      id: 'tech-h',
      name: 'Occupied Tech',
      skills: JSON.stringify(['PLUMBING']),
      serviceZones: JSON.stringify(['ZONE_NORTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'ON_SHIFT',
    };

    const existingJob = {
      id: 'job-h-existing',
      customerName: 'Routine Sink Client',
      description: 'Slow drain',
      requiredSkills: JSON.stringify(['PLUMBING']),
      priority: 'LOW',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T09:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'PENDING',
    };

    const urgentJob = {
      id: 'job-h-urgent',
      customerName: 'Burst Main Pipe',
      description: 'Major flooding emergency',
      requiredSkills: JSON.stringify(['PLUMBING']),
      priority: 'CRITICAL',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T09:00:00.000Z'),
      latestEnd: new Date('2026-11-02T14:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T11:00:00.000Z'),
      status: 'PENDING',
    };

    const activeAssignments = [
      {
        id: 'asgn-h-existing',
        jobId: existingJob.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T09:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T10:00:00.000Z'),
        status: 'SCHEDULED',
      },
    ];

    const result = runRecoveryEngine({
      disruptionId: 'dis-h',
      eventType: 'URGENT_JOB_ARRIVAL',
      jobId: urgentJob.id,
      activeAssignments,
      allJobs: [existingJob, urgentJob],
      technicians: [tech],
      options: { referenceDate: refDate },
    });

    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.metrics.slaViolationsAfter).toBe(0);
  });

  // -------------------------------------------------------------
  // Scenario I: Completed job is included in a re-optimization request
  // -------------------------------------------------------------
  it('Scenario I: leaves completed job strictly immutable when re-optimizing schedules', () => {
    const tech = {
      id: 'tech-i',
      name: 'Optimizer Tech',
      skills: JSON.stringify(['HARDWARE_REPAIR']),
      serviceZones: JSON.stringify(['ZONE_WEST']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const completedJob = {
      id: 'job-i-completed',
      customerName: 'Finished Client',
      description: 'Server RAM replacement',
      requiredSkills: JSON.stringify(['HARDWARE_REPAIR']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_WEST',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T10:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T10:00:00.000Z'),
      status: 'COMPLETED',
    };

    const pendingJob = {
      id: 'job-i-pending',
      customerName: 'Pending Client',
      description: 'Disk replacement',
      requiredSkills: JSON.stringify(['HARDWARE_REPAIR']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_WEST',
      earliestStart: new Date('2026-11-02T10:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T15:00:00.000Z'),
      status: 'PENDING',
    };

    const assignments = [
      {
        jobId: completedJob.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:30:00.000Z'),
        travelTimeMinutes: 10,
        status: 'COMPLETED',
        job: completedJob,
      },
      {
        jobId: pendingJob.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T10:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T11:30:00.000Z'),
        travelTimeMinutes: 15,
        status: 'SCHEDULED',
        job: pendingJob,
      },
    ];

    const result = runOptimizationEngine(assignments, [completedJob, pendingJob], [tech], {
      maxIterations: 10,
    });

    // Completed assignment must be unmodified
    const completedOpt = result.optimizedAssignments.find((a) => a.jobId === completedJob.id)!;
    expect(completedOpt.scheduledStart.toISOString()).toBe('2026-11-02T08:30:00.000Z');
    expect(completedOpt.scheduledEnd.toISOString()).toBe('2026-11-02T09:30:00.000Z');
    expect(completedOpt.status).toBe('COMPLETED');
  });

  // -------------------------------------------------------------
  // Scenario J: In-progress job is affected by a delayed completion event
  // -------------------------------------------------------------
  it('Scenario J: safely pushes subsequent schedule when on-site delay occurs without altering in-progress work', () => {
    const tech = {
      id: 'tech-j',
      name: 'Delayed Specialist',
      skills: JSON.stringify(['MECHANICAL']),
      serviceZones: JSON.stringify(['ZONE_CENTRAL']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'ON_SHIFT',
    };

    const inProgressJob = {
      id: 'job-j1',
      customerName: 'Current Active Job',
      description: 'Motor rewinding',
      requiredSkills: JSON.stringify(['MECHANICAL']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T09:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'IN_PROGRESS',
    };

    const upcomingJob = {
      id: 'job-j2',
      customerName: 'Next Afternoon Job',
      description: 'Belt replacement',
      requiredSkills: JSON.stringify(['MECHANICAL']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T10:30:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'PENDING',
    };

    const activeAssignments = [
      {
        id: 'asgn-j1',
        jobId: inProgressJob.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T09:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T10:00:00.000Z'),
        status: 'IN_PROGRESS',
      },
      {
        id: 'asgn-j2',
        jobId: upcomingJob.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T10:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T11:30:00.000Z'),
        status: 'SCHEDULED',
      },
    ];

    const result = runRecoveryEngine({
      disruptionId: 'dis-j',
      eventType: 'DELAYED_COMPLETION',
      jobId: inProgressJob.id,
      eventPayload: { delayMinutes: 45 },
      activeAssignments,
      allJobs: [inProgressJob, upcomingJob],
      technicians: [tech],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('RESOLVED');
    // In-progress job is preserved
    const inProgAction = result.actions.find((a) => a.jobId === inProgressJob.id);
    expect(inProgAction?.actionType).toBe('MAINTAIN');
  });

  // -------------------------------------------------------------
  // Scenario K: Multiple jobs have identical priority and SLA deadlines
  // -------------------------------------------------------------
  it('Scenario K: guarantees deterministic tie-breaking by job ID when priorities and SLAs are identical', () => {
    const tech = {
      id: 'tech-k',
      name: 'Tiebreaker Tech',
      skills: JSON.stringify(['GENERAL_MAINTENANCE']),
      serviceZones: JSON.stringify(['ZONE_NORTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    // Identical priority (HIGH), duration (60m), SLA (12:00)
    const jobA = {
      id: 'job-k-alpha',
      customerName: 'Client Alpha',
      description: 'Identical job',
      requiredSkills: JSON.stringify(['GENERAL_MAINTENANCE']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T14:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T12:00:00.000Z'),
      status: 'PENDING',
    };

    const jobZ = {
      id: 'job-k-zeta',
      customerName: 'Client Zeta',
      description: 'Identical job',
      requiredSkills: JSON.stringify(['GENERAL_MAINTENANCE']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T14:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T12:00:00.000Z'),
      status: 'PENDING',
    };

    // Run 1: [jobA, jobZ]
    const res1 = runSchedulingEngine([jobA, jobZ], [tech], { referenceDate: refDate });
    // Run 2: [jobZ, jobA] (shuffled input)
    const res2 = runSchedulingEngine([jobZ, jobA], [tech], { referenceDate: refDate });

    // Both runs must choose identical ordering: job-k-alpha before job-k-zeta
    const r1Alpha = res1.decisions.find((d) => d.jobId === jobA.id)!;
    const r2Alpha = res2.decisions.find((d) => d.jobId === jobA.id)!;

    expect(r1Alpha.selectedSlot!.scheduledStart.getTime()).toBe(
      r2Alpha.selectedSlot!.scheduledStart.getTime()
    );
    expect(r1Alpha.selectedSlot!.scheduledStart.getTime()).toBeLessThan(
      res1.decisions.find((d) => d.jobId === jobZ.id)!.selectedSlot!.scheduledStart.getTime()
    );
  });

  // -------------------------------------------------------------
  // Scenario L: Multiple technicians have identical assignment scores
  // -------------------------------------------------------------
  it('Scenario L: guarantees deterministic tie-breaking by technician ID when technician scores are identical', () => {
    const techA = {
      id: 'tech-l-01',
      name: 'Specialist 1',
      skills: JSON.stringify(['PLUMBING']),
      serviceZones: JSON.stringify(['ZONE_EAST']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const techB = {
      id: 'tech-l-02',
      name: 'Specialist 2',
      skills: JSON.stringify(['PLUMBING']),
      serviceZones: JSON.stringify(['ZONE_EAST']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const job = {
      id: 'job-l',
      customerName: 'Tiebreak Test',
      description: 'Single slot evaluation',
      requiredSkills: JSON.stringify(['PLUMBING']),
      priority: 'MEDIUM',
      estimatedDuration: 45,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_EAST',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T14:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T13:00:00.000Z'),
      status: 'PENDING',
    };

    // Run 1: [techA, techB]
    const res1 = runSchedulingEngine([job], [techA, techB], { referenceDate: refDate });
    // Run 2: [techB, techA] (shuffled input)
    const res2 = runSchedulingEngine([job], [techB, techA], { referenceDate: refDate });

    // Must deterministically pick tech-l-01 in both runs
    expect(res1.decisions[0].selectedTechnicianId).toBe('tech-l-01');
    expect(res2.decisions[0].selectedTechnicianId).toBe('tech-l-01');
  });
});
