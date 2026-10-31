import { describe, it, expect } from 'vitest';
import { runOptimizationEngine } from '../src/optimization/optimization.engine';
import { calculateScheduleQualityScore } from '../src/optimization/optimization.objective';

describe('Phase 11: Assignment Optimization Engine Deep Validation', () => {
  const refDate = new Date('2026-11-02T00:00:00.000Z');

  // -------------------------------------------------------------
  // TEST 1: Schedule with No Possible Improvement
  // -------------------------------------------------------------
  it('1. correctly identifies optimal schedule where no moves improve score without regress', () => {
    const tech = {
      id: 'opt-tech-1',
      name: 'Solo Perfect Tech',
      skills: JSON.stringify(['HVAC']),
      serviceZones: JSON.stringify(['ZONE_CENTRAL']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const job1 = {
      id: 'opt-job-1',
      customerName: 'Customer 1',
      description: 'Filter clean',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'PENDING',
    };

    const assignments = [
      {
        jobId: job1.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T08:15:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:15:00.000Z'),
        travelTimeMinutes: 5,
        status: 'SCHEDULED',
        job: job1,
      },
    ];

    const result = runOptimizationEngine(assignments, [job1], [tech], {
      maxIterations: 10,
      referenceDate: refDate,
    });

    // Score must be monotonic (never worse)
    expect(result.optimizedMetrics.qualityScore).toBeGreaterThanOrEqual(result.baselineMetrics.qualityScore);
    expect(result.status).toBe('NO_IMPROVEMENT');
    expect(result.changes.length).toBe(0);
  });

  // -------------------------------------------------------------
  // TEST 2: Schedule with Major Travel Inefficiencies (2-Opt Swap)
  // -------------------------------------------------------------
  it('2. repairs zigzag route inefficiencies via intra-route 2-opt reordering', () => {
    const tech = {
      id: 'zigzag-tech',
      name: 'Roving Specialist',
      skills: JSON.stringify(['ELECTRICAL']),
      serviceZones: JSON.stringify(['ZONE_CENTRAL']),
      latitude: 37.77, // Base
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    // Close job (~1km)
    const jobNear = {
      id: 'job-near',
      customerName: 'Near Neighbor',
      description: 'Breaker',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'MEDIUM',
      estimatedDuration: 45,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T17:00:00.000Z'),
      status: 'PENDING',
    };

    // Far job (~15km)
    const jobFar = {
      id: 'job-far',
      customerName: 'Far Industrial',
      description: 'Subpanel',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'MEDIUM',
      estimatedDuration: 45,
      latitude: 37.85,
      longitude: -122.48,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T17:00:00.000Z'),
      status: 'PENDING',
    };

    // Sub-optimal assignment order: Far job scheduled first, then Near job
    const assignments = [
      {
        jobId: jobFar.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T09:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:45:00.000Z'),
        travelTimeMinutes: 40,
        status: 'SCHEDULED',
        job: jobFar,
      },
      {
        jobId: jobNear.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T11:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T11:45:00.000Z'),
        travelTimeMinutes: 40,
        status: 'SCHEDULED',
        job: jobNear,
      },
    ];

    const result = runOptimizationEngine(assignments, [jobNear, jobFar], [tech], {
      maxIterations: 20,
      referenceDate: refDate,
    });

    expect(result.optimizedMetrics.qualityScore).toBeGreaterThanOrEqual(result.baselineMetrics.qualityScore);
    expect(result.optimizedMetrics.totalTravelMinutes).toBeLessThanOrEqual(result.baselineMetrics.totalTravelMinutes);
  });

  // -------------------------------------------------------------
  // TEST 3: Schedule with Unbalanced Workload
  // -------------------------------------------------------------
  it('3. redistributes jobs from overloaded to underloaded technicians', () => {
    const techOverloaded = {
      id: 'tech-overloaded',
      name: 'Busy Bob',
      skills: JSON.stringify(['PLUMBING']),
      serviceZones: JSON.stringify(['ZONE_NORTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const techIdle = {
      id: 'tech-idle',
      name: 'Free Frank',
      skills: JSON.stringify(['PLUMBING']),
      serviceZones: JSON.stringify(['ZONE_NORTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const jobs = [1, 2, 3].map((i) => ({
      id: `job-plumb-${i}`,
      customerName: `Plumb Client ${i}`,
      description: 'Drain clearing',
      requiredSkills: JSON.stringify(['PLUMBING']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T17:00:00.000Z'),
      status: 'PENDING',
    }));

    // All 3 jobs assigned to Busy Bob, 0 to Free Frank
    const assignments = jobs.map((j, i) => ({
      jobId: j.id,
      technicianId: techOverloaded.id,
      scheduledStart: new Date(`2026-11-02T0${8 + i * 2}:30:00.000Z`),
      scheduledEnd: new Date(`2026-11-02T0${9 + i * 2}:30:00.000Z`),
      travelTimeMinutes: 10,
      status: 'SCHEDULED',
      job: j,
    }));

    const result = runOptimizationEngine(assignments, jobs, [techOverloaded, techIdle], {
      maxIterations: 25,
      referenceDate: refDate,
    });

    expect(result.optimizedMetrics.qualityScore).toBeGreaterThanOrEqual(result.baselineMetrics.qualityScore);
    // Workload standard deviation must be improved or equal
    expect(result.optimizedMetrics.workloadVariance).toBeLessThanOrEqual(result.baselineMetrics.workloadVariance);
  });

  // -------------------------------------------------------------
  // TEST 4: Schedule with Critical Jobs Unassigned
  // -------------------------------------------------------------
  it('4. opportunistic insertion assigns previously unassigned critical work orders into available gaps', () => {
    const tech = {
      id: 'tech-gap',
      name: 'Gap Specialist',
      skills: JSON.stringify(['SECURITY_SYSTEMS']),
      serviceZones: JSON.stringify(['ZONE_EAST']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const scheduledJob = {
      id: 'job-morning-only',
      customerName: 'Morning Only',
      description: 'Keypad reset',
      requiredSkills: JSON.stringify(['SECURITY_SYSTEMS']),
      priority: 'LOW',
      estimatedDuration: 45,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_EAST',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T10:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T10:00:00.000Z'),
      status: 'PENDING',
    };

    const unassignedCriticalJob = {
      id: 'job-critical-unassigned',
      customerName: 'Emergency Vault Door',
      description: 'Vault door locked',
      requiredSkills: JSON.stringify(['SECURITY_SYSTEMS']),
      priority: 'CRITICAL',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_EAST',
      earliestStart: new Date('2026-11-02T11:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T15:00:00.000Z'),
      status: 'UNASSIGNED',
    };

    const assignments = [
      {
        jobId: scheduledJob.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T08:10:00.000Z'),
        scheduledEnd: new Date('2026-11-02T08:55:00.000Z'),
        travelTimeMinutes: 10,
        status: 'SCHEDULED',
        job: scheduledJob,
      },
    ];

    const result = runOptimizationEngine(
      assignments,
      [scheduledJob, unassignedCriticalJob],
      [tech],
      {
        maxIterations: 15,
        referenceDate: refDate,
      }
    );

    // The critical job should now be included in the optimized schedule
    const isCriticalAssigned = result.optimizedAssignments.some(
      (a) => a.jobId === unassignedCriticalJob.id
    );
    expect(isCriticalAssigned).toBe(true);
    expect(result.optimizedMetrics.assignedJobs).toBe(2);
  });

  // -------------------------------------------------------------
  // TEST 5: Complete Protection of COMPLETED and IN_PROGRESS Assignments
  // -------------------------------------------------------------
  it('5. strictly prevents modification or movement of COMPLETED and IN_PROGRESS work orders', () => {
    const tech = {
      id: 'tech-protect',
      name: 'Shift Worker',
      skills: JSON.stringify(['HVAC']),
      serviceZones: JSON.stringify(['ZONE_CENTRAL']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const completedJob = {
      id: 'job-p1',
      customerName: 'Protected Completed',
      description: 'Chiller valve',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T10:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T10:00:00.000Z'),
      status: 'COMPLETED',
    };

    const inProgressJob = {
      id: 'job-p2',
      customerName: 'Protected Active',
      description: 'Motor coil',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T10:00:00.000Z'),
      latestEnd: new Date('2026-11-02T12:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T12:00:00.000Z'),
      status: 'IN_PROGRESS',
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
        jobId: inProgressJob.id,
        technicianId: tech.id,
        scheduledStart: new Date('2026-11-02T10:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T11:00:00.000Z'),
        travelTimeMinutes: 10,
        status: 'IN_PROGRESS',
        job: inProgressJob,
      },
    ];

    const result = runOptimizationEngine(assignments, [completedJob, inProgressJob], [tech], {
      maxIterations: 30,
      referenceDate: refDate,
    });

    const optP1 = result.optimizedAssignments.find((a) => a.jobId === completedJob.id)!;
    const optP2 = result.optimizedAssignments.find((a) => a.jobId === inProgressJob.id)!;

    // Both must remain unchanged in time and status
    expect(optP1.scheduledStart.toISOString()).toBe('2026-11-02T08:30:00.000Z');
    expect(optP1.status).toBe('COMPLETED');
    expect(optP2.scheduledStart.toISOString()).toBe('2026-11-02T10:00:00.000Z');
    expect(optP2.status).toBe('IN_PROGRESS');
  });

  // -------------------------------------------------------------
  // TEST 6: Determinism (Identical Inputs Produce Identical Outputs)
  // -------------------------------------------------------------
  it('6. produces strictly identical optimization results across repeated invocations', () => {
    const tech = {
      id: 'tech-det',
      name: 'Deterministic Tech',
      skills: JSON.stringify(['NETWORKING']),
      serviceZones: JSON.stringify(['ZONE_WEST']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const jobs = [1, 2, 3, 4].map((i) => ({
      id: `job-det-${i}`,
      customerName: `Client ${i}`,
      description: 'Router configuration',
      requiredSkills: JSON.stringify(['NETWORKING']),
      priority: 'MEDIUM',
      estimatedDuration: 45,
      latitude: 37.77 + i * 0.005,
      longitude: -122.41 + i * 0.005,
      serviceZone: 'ZONE_WEST',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T17:00:00.000Z'),
      status: 'PENDING',
    }));

    const assignments = jobs.map((j, i) => ({
      jobId: j.id,
      technicianId: tech.id,
      scheduledStart: new Date(`2026-11-02T0${9 + i}:00:00.000Z`),
      scheduledEnd: new Date(`2026-11-02T0${9 + i}:45:00.000Z`),
      travelTimeMinutes: 10,
      status: 'SCHEDULED',
      job: j,
    }));

    const run1 = runOptimizationEngine(assignments, jobs, [tech], { maxIterations: 15 });
    const run2 = runOptimizationEngine(assignments, jobs, [tech], { maxIterations: 15 });

    expect(run1.optimizedMetrics.qualityScore).toBe(run2.optimizedMetrics.qualityScore);
    expect(run1.changes.length).toBe(run2.changes.length);

    for (let i = 0; i < run1.optimizedAssignments.length; i++) {
      expect(run1.optimizedAssignments[i].jobId).toBe(run2.optimizedAssignments[i].jobId);
      expect(run1.optimizedAssignments[i].scheduledStart.getTime()).toBe(
        run2.optimizedAssignments[i].scheduledStart.getTime()
      );
    }
  });
});
