import { describe, it, expect } from 'vitest';
import { runRecoveryEngine } from '../src/recovery/recovery.engine';
import { DisruptionEventType } from '../src/recovery/recovery.types';

describe('Phase 11: Disruption Management and Intelligent Recovery Engine Validation', () => {
  const refDate = new Date('2026-11-02T00:00:00.000Z');

  // Base Technicians
  const techAlpha = {
    id: 'tech-alpha',
    name: 'Alpha Lead',
    email: 'alpha@dispatchgrid.io',
    skills: JSON.stringify(['HVAC', 'ELECTRICAL']),
    serviceZones: JSON.stringify(['ZONE_NORTH']),
    latitude: 37.77,
    longitude: -122.41,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    availabilityStatus: 'AVAILABLE',
  };

  const techBeta = {
    id: 'tech-beta',
    name: 'Beta Backup',
    email: 'beta@dispatchgrid.io',
    skills: JSON.stringify(['HVAC', 'ELECTRICAL', 'PLUMBING']),
    serviceZones: JSON.stringify(['ZONE_NORTH']),
    latitude: 37.771,
    longitude: -122.411,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    availabilityStatus: 'AVAILABLE',
  };

  const techGamma = {
    id: 'tech-gamma',
    name: 'Gamma South',
    email: 'gamma@dispatchgrid.io',
    skills: JSON.stringify(['HVAC']),
    serviceZones: JSON.stringify(['ZONE_SOUTH']),
    latitude: 37.72,
    longitude: -122.40,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    availabilityStatus: 'AVAILABLE',
  };

  // -------------------------------------------------------------
  // SCENARIO A: TECHNICIAN_UNAVAILABLE (Reassignment to eligible peer)
  // -------------------------------------------------------------
  it('Scenario A: reassigns jobs to an eligible backup technician when primary technician becomes unavailable', () => {
    const jobA = {
      id: 'job-hvac-1',
      customerName: 'Acme Cold Storage',
      description: 'Chiller compressor fault',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'HIGH',
      estimatedDuration: 90,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T15:00:00.000Z'),
      status: 'ASSIGNED',
    };

    const initialAssignments = [
      {
        jobId: jobA.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T10:00:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: jobA,
      },
    ];

    const result = runRecoveryEngine({
      disruptionId: 'disrupt-tech-sick',
      eventType: 'TECHNICIAN_UNAVAILABLE',
      technicianId: techAlpha.id,
      eventPayload: { reason: 'Sudden illness' },
      activeAssignments: initialAssignments,
      allJobs: [jobA],
      technicians: [techAlpha, techBeta, techGamma],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('RESOLVED');
    expect(result.metrics.affectedJobsCount).toBe(1);
    expect(result.metrics.recoveredJobsCount).toBe(1);
    expect(result.metrics.unrecoveredJobsCount).toBe(0);

    // Job must be reassigned to techBeta (matching skills & ZONE_NORTH)
    const reassignedAction = result.actions.find((a) => a.jobId === jobA.id);
    expect(reassignedAction).toBeDefined();
    expect(reassignedAction?.actionType).toBe('REASSIGN');
    expect(reassignedAction?.newTechnicianId).toBe(techBeta.id);
  });

  // -------------------------------------------------------------
  // SCENARIO A2: Graceful Degradation when NO eligible technician exists
  // -------------------------------------------------------------
  it('Scenario A (Edge): unassigns affected work orders gracefully when no eligible peer technician exists', () => {
    const jobSpecial = {
      id: 'job-special-elec',
      customerName: 'Data Center Substation',
      description: 'High voltage switchgear repair',
      requiredSkills: JSON.stringify(['HIGH_VOLTAGE']),
      priority: 'CRITICAL',
      estimatedDuration: 120,
      latitude: 37.77,
      longitude: -122.41,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'ASSIGNED',
    };

    const initialAssignments = [
      {
        jobId: jobSpecial.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T09:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T11:00:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: jobSpecial,
      },
    ];

    // Neither techBeta nor techGamma has HIGH_VOLTAGE skill
    const result = runRecoveryEngine({
      disruptionId: 'disrupt-solo-specialist-sick',
      eventType: 'TECHNICIAN_UNAVAILABLE',
      technicianId: techAlpha.id,
      eventPayload: { reason: 'Injured on duty' },
      activeAssignments: initialAssignments,
      allJobs: [jobSpecial],
      technicians: [techAlpha, techBeta, techGamma],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('FAILED');
    expect(result.metrics.unrecoveredJobsCount).toBe(1);

    const unassignAction = result.actions.find((a) => a.jobId === jobSpecial.id);
    expect(unassignAction).toBeDefined();
    expect(unassignAction?.actionType).toBe('MARK_UNASSIGNED');
    expect(unassignAction?.failureCode).toBe('REQUIRED_SKILL_UNAVAILABLE');
    expect(unassignAction?.explanation).toContain('REQUIRED_SKILL_UNAVAILABLE');
  });

  // -------------------------------------------------------------
  // SCENARIO B: URGENT_JOB_ARRIVAL (Slotting emergent critical job)
  // -------------------------------------------------------------
  it('Scenario B: dispatches urgent break-in job into an available schedule gap', () => {
    const existingJob = {
      id: 'job-existing-morning',
      customerName: 'Morning Bakery',
      description: 'Oven igniter replacement',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T10:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T10:00:00.000Z'),
      status: 'ASSIGNED',
    };

    const urgentJob = {
      id: 'job-urgent-break-in',
      customerName: 'Hospital Trauma Center',
      description: 'Emergency generator electrical transfer failure',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'CRITICAL',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T11:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T14:00:00.000Z'),
      status: 'PENDING',
    };

    const initialAssignments = [
      {
        jobId: existingJob.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T08:15:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:15:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: existingJob,
      },
    ];

    const result = runRecoveryEngine({
      disruptionId: 'disrupt-emergency-hospital',
      eventType: 'URGENT_JOB_ARRIVAL',
      jobId: urgentJob.id,
      eventPayload: { priority: 'CRITICAL' },
      activeAssignments: initialAssignments,
      allJobs: [existingJob, urgentJob],
      technicians: [techAlpha],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('RESOLVED');
    expect(result.metrics.recoveredJobsCount).toBe(1);

    const assignAction = result.actions.find((a) => a.jobId === urgentJob.id);
    expect(assignAction).toBeDefined();
    expect(assignAction?.actionType).toBe('DISPATCH_NEW');
    expect(assignAction?.newTechnicianId).toBe(techAlpha.id);
  });

  // -------------------------------------------------------------
  // SCENARIO C: JOB_DURATION_CHANGED (Cascade detection & time adjustment)
  // -------------------------------------------------------------
  it('Scenario C: reschedules downstream assignments when a job duration unexpectedly expands', () => {
    const job1 = {
      id: 'job-dur-1',
      customerName: 'Office Suite A',
      description: 'AC coil cleaning (was 60m, now 150m)',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T12:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T12:00:00.000Z'),
      status: 'IN_PROGRESS',
    };

    const job2 = {
      id: 'job-dur-2',
      customerName: 'Office Suite B',
      description: 'Thermostat sensor diagnostic',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'MEDIUM',
      estimatedDuration: 45,
      latitude: 37.773,
      longitude: -122.413,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T09:30:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T15:00:00.000Z'),
      status: 'ASSIGNED',
    };

    // Original plan: Job 1 from 08:30 - 09:30. Job 2 from 09:45 - 10:30.
    const initialAssignments = [
      {
        jobId: job1.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:30:00.000Z'),
        travelTime: 10,
        status: 'IN_PROGRESS',
        job: job1,
      },
      {
        jobId: job2.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T09:45:00.000Z'),
        scheduledEnd: new Date('2026-11-02T10:30:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: job2,
      },
    ];

    // Job 1 extended by +90 minutes -> now ends at 11:00
    const result = runRecoveryEngine({
      disruptionId: 'disrupt-job1-expansion',
      eventType: 'JOB_DURATION_CHANGED',
      jobId: job1.id,
      eventPayload: { newDurationMinutes: 150, delayMinutes: 90 },
      activeAssignments: initialAssignments,
      allJobs: [{ ...job1, estimatedDuration: 150 }, job2],
      technicians: [techAlpha, techBeta],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('RESOLVED');
    // Job 2 must be adjusted or reassigned without overlapping Job 1's new end time
    const updatedJob2 = result.updatedAssignments.find((a) => a.jobId === job2.id);
    expect(updatedJob2).toBeDefined();
    if (updatedJob2?.technicianId === techAlpha.id) {
      expect(new Date(updatedJob2.scheduledStart).getTime()).toBeGreaterThanOrEqual(
        new Date('2026-11-02T11:00:00.000Z').getTime()
      );
    }
  });

  // -------------------------------------------------------------
  // SCENARIO D: JOB_CANCELLED (Eliminating deadhead gap)
  // -------------------------------------------------------------
  it('Scenario D: safely removes cancelled assignment and compacts schedule', () => {
    const jobA = {
      id: 'job-cancel-target',
      customerName: 'Cancelled Client',
      description: 'Scheduled maintenance',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'LOW',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T11:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T11:00:00.000Z'),
      status: 'ASSIGNED',
    };

    const jobB = {
      id: 'job-cancel-following',
      customerName: 'Followup Client',
      description: 'Duct inspection',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.773,
      longitude: -122.413,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'ASSIGNED',
    };

    const initialAssignments = [
      {
        jobId: jobA.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:30:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: jobA,
      },
      {
        jobId: jobB.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T10:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T11:00:00.000Z'),
        travelTime: 15,
        status: 'SCHEDULED',
        job: jobB,
      },
    ];

    const result = runRecoveryEngine({
      disruptionId: 'disrupt-job-cancelled',
      eventType: 'JOB_CANCELLED',
      jobId: jobA.id,
      eventPayload: { reason: 'Customer rescheduled out of band' },
      activeAssignments: initialAssignments,
      allJobs: [{ ...jobA, status: 'CANCELLED' }, jobB],
      technicians: [techAlpha],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('RESOLVED');
    // jobA should be removed from active assignments
    const activeJobA = result.updatedAssignments.find((a) => a.jobId === jobA.id);
    expect(activeJobA).toBeUndefined();

    // jobB must remain assigned and scheduled
    const activeJobB = result.updatedAssignments.find((a) => a.jobId === jobB.id);
    expect(activeJobB).toBeDefined();
    expect(activeJobB?.technicianId).toBe(techAlpha.id);
  });

  // -------------------------------------------------------------
  // SCENARIO E: EARLY_COMPLETION (Pulling downstream jobs forward)
  // -------------------------------------------------------------
  it('Scenario E: pulls downstream work forward when early completion frees up capacity', () => {
    const jobEarly = {
      id: 'job-early-done',
      customerName: 'Quick Fix Inc',
      description: 'Breaker flipped',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T12:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T12:00:00.000Z'),
      status: 'COMPLETED',
    };

    const jobNext = {
      id: 'job-waiting-next',
      customerName: 'Industrial Warehouse',
      description: 'Lighting fixture wiring',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.773,
      longitude: -122.413,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'ASSIGNED',
    };

    // Planned: jobEarly from 08:30 - 09:30, but finished at 08:45 (45m early).
    // jobNext was planned at 10:30 - 11:30.
    const initialAssignments = [
      {
        jobId: jobEarly.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T08:45:00.000Z'),
        travelTime: 10,
        status: 'COMPLETED',
        job: jobEarly,
      },
      {
        jobId: jobNext.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T10:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T11:30:00.000Z'),
        travelTime: 15,
        status: 'SCHEDULED',
        job: jobNext,
      },
    ];

    const result = runRecoveryEngine({
      disruptionId: 'disrupt-early-finish',
      eventType: 'EARLY_COMPLETION',
      jobId: jobEarly.id,
      eventPayload: { actualCompletedAt: new Date('2026-11-02T08:45:00.000Z').toISOString() },
      activeAssignments: initialAssignments,
      allJobs: [jobEarly, jobNext],
      technicians: [techAlpha],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('RESOLVED');
    const updatedJobNext = result.updatedAssignments.find((a) => a.jobId === jobNext.id);
    expect(updatedJobNext).toBeDefined();
    // jobNext should be pulled earlier than its original 10:30 start
    expect(new Date(updatedJobNext!.scheduledStart).getTime()).toBeLessThanOrEqual(
      new Date('2026-11-02T10:30:00.000Z').getTime()
    );
  });

  // -------------------------------------------------------------
  // SCENARIO F: DELAYED_COMPLETION (Propagating delays safely)
  // -------------------------------------------------------------
  it('Scenario F: safely shifts downstream tasks to avoid overlaps when an ongoing job is delayed', () => {
    const jobDelay = {
      id: 'job-delay-ongoing',
      customerName: 'Complex Facility',
      description: 'Pipe re-routing',
      requiredSkills: JSON.stringify(['PLUMBING']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T14:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T14:00:00.000Z'),
      status: 'IN_PROGRESS',
    };

    const jobNext = {
      id: 'job-delay-downstream',
      customerName: 'Commercial Kitchen',
      description: 'Grease trap valve',
      requiredSkills: JSON.stringify(['PLUMBING']),
      priority: 'HIGH',
      estimatedDuration: 45,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'ASSIGNED',
    };

    // Planned: jobDelay from 08:30 - 09:30, but delayed until 10:15 (+45m).
    // jobNext was originally planned at 09:45 - 10:30.
    const initialAssignments = [
      {
        jobId: jobDelay.id,
        technicianId: techBeta.id,
        scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:30:00.000Z'),
        travelTime: 10,
        status: 'IN_PROGRESS',
        job: jobDelay,
      },
      {
        jobId: jobNext.id,
        technicianId: techBeta.id,
        scheduledStart: new Date('2026-11-02T09:45:00.000Z'),
        scheduledEnd: new Date('2026-11-02T10:30:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: jobNext,
      },
    ];

    const result = runRecoveryEngine({
      disruptionId: 'disrupt-delayed-completion',
      eventType: 'DELAYED_COMPLETION',
      jobId: jobDelay.id,
      eventPayload: { delayedUntil: new Date('2026-11-02T10:15:00.000Z').toISOString() },
      activeAssignments: initialAssignments,
      allJobs: [jobDelay, jobNext],
      technicians: [techBeta],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('RESOLVED');
    const updatedJobNext = result.updatedAssignments.find((a) => a.jobId === jobNext.id);
    expect(updatedJobNext).toBeDefined();
    // jobNext must start after jobDelay's revised completion (10:15)
    expect(new Date(updatedJobNext!.scheduledStart).getTime()).toBeGreaterThanOrEqual(
      new Date('2026-11-02T10:15:00.000Z').getTime()
    );
  });

  // -------------------------------------------------------------
  // TEST: Inviolable Protection of COMPLETED and IN_PROGRESS Jobs
  // -------------------------------------------------------------
  it('strictly protects COMPLETED and IN_PROGRESS assignments from modification during disruption recovery', () => {
    const jobCompleted = {
      id: 'job-completed-anchor',
      customerName: 'Early Morning Bakery',
      description: 'Breaker box',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T10:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T10:00:00.000Z'),
      status: 'COMPLETED',
    };

    const jobInProgress = {
      id: 'job-in-progress-anchor',
      customerName: 'Medical Clinic',
      description: 'Backup circuit',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T09:00:00.000Z'),
      latestEnd: new Date('2026-11-02T12:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T12:00:00.000Z'),
      status: 'IN_PROGRESS',
    };

    const jobPending = {
      id: 'job-future-pending',
      customerName: 'Retail Shop',
      description: 'Display lighting',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'LOW',
      estimatedDuration: 60,
      latitude: 37.773,
      longitude: -122.413,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T12:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T17:00:00.000Z'),
      status: 'ASSIGNED',
    };

    const initialAssignments = [
      {
        jobId: jobCompleted.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T08:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:00:00.000Z'),
        travelTime: 5,
        status: 'COMPLETED',
        job: jobCompleted,
      },
      {
        jobId: jobInProgress.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T09:15:00.000Z'),
        scheduledEnd: new Date('2026-11-02T10:15:00.000Z'),
        travelTime: 10,
        status: 'IN_PROGRESS',
        job: jobInProgress,
      },
      {
        jobId: jobPending.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T13:00:00.000Z'),
        scheduledEnd: new Date('2026-11-02T14:00:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: jobPending,
      },
    ];

    // Technician unavailable from 12:00 onward
    const result = runRecoveryEngine({
      disruptionId: 'disrupt-afternoon-sick',
      eventType: 'TECHNICIAN_UNAVAILABLE',
      technicianId: techAlpha.id,
      eventPayload: { unavailableFrom: '12:00' },
      activeAssignments: initialAssignments,
      allJobs: [jobCompleted, jobInProgress, jobPending],
      technicians: [techAlpha, techBeta],
      options: { referenceDate: refDate },
    });

    // Neither COMPLETED nor IN_PROGRESS jobs should be modified
    const completedAfter = result.updatedAssignments.find((a) => a.jobId === jobCompleted.id);
    const inProgressAfter = result.updatedAssignments.find((a) => a.jobId === jobInProgress.id);

    expect(completedAfter?.status).toBe('COMPLETED');
    expect(completedAfter?.technicianId).toBe(techAlpha.id);
    expect(completedAfter?.scheduledStart.getTime()).toBe(new Date('2026-11-02T08:00:00.000Z').getTime());

    expect(inProgressAfter?.status).toBe('IN_PROGRESS');
    expect(inProgressAfter?.technicianId).toBe(techAlpha.id);
    expect(inProgressAfter?.scheduledStart.getTime()).toBe(new Date('2026-11-02T09:15:00.000Z').getTime());
  });

  // -------------------------------------------------------------
  // TEST: Sequential Multi-Disruption Resilience
  // -------------------------------------------------------------
  it('executes sequential disruptions iteratively without schedule corruption', () => {
    const job1 = {
      id: 'seq-job-1',
      customerName: 'Sequential Client 1',
      description: 'Panel fix',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'ASSIGNED',
    };

    const initialAssignments = [
      {
        jobId: job1.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:30:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: job1,
      },
    ];

    // First Disruption: techAlpha becomes unavailable -> moved to techBeta
    const recovery1 = runRecoveryEngine({
      disruptionId: 'seq-disrupt-1',
      eventType: 'TECHNICIAN_UNAVAILABLE',
      technicianId: techAlpha.id,
      activeAssignments: initialAssignments,
      allJobs: [job1],
      technicians: [techAlpha, techBeta],
      options: { referenceDate: refDate },
    });

    expect(recovery1.recoveryStatus).toBe('RESOLVED');
    const assignedAfter1 = recovery1.updatedAssignments.find((a) => a.jobId === job1.id);
    expect(assignedAfter1?.technicianId).toBe(techBeta.id);

    // Second Disruption: job duration expanded on techBeta
    const recovery2 = runRecoveryEngine({
      disruptionId: 'seq-disrupt-2',
      eventType: 'JOB_DURATION_CHANGED',
      jobId: job1.id,
      eventPayload: { newDurationMinutes: 120 },
      activeAssignments: recovery1.updatedAssignments.map((a) => ({
        ...a,
        job: { ...job1, estimatedDuration: 120 },
      })),
      allJobs: [{ ...job1, estimatedDuration: 120 }],
      technicians: [techBeta],
      options: { referenceDate: refDate },
    });

    expect(recovery2.recoveryStatus).toBe('RESOLVED');
    const assignedAfter2 = recovery2.updatedAssignments.find((a) => a.jobId === job1.id);
    expect(assignedAfter2).toBeDefined();
    expect(assignedAfter2?.technicianId).toBe(techBeta.id);
    // Duration should now be 120m (2 hours)
    const durMins = (assignedAfter2!.scheduledEnd.getTime() - assignedAfter2!.scheduledStart.getTime()) / 60000;
    expect(durMins).toBe(120);
  });

  // -------------------------------------------------------------
  // TEST: Zero-Change Recovery for Idle Technician
  // -------------------------------------------------------------
  it('handles disruption on an idle technician with 0 active assignments cleanly without schedule changes', () => {
    const techIdle = {
      id: 'tech-idle',
      name: 'Idle Backup',
      email: 'idle@dispatchgrid.io',
      skills: JSON.stringify(['HVAC']),
      serviceZones: JSON.stringify(['ZONE_NORTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    const result = runRecoveryEngine({
      disruptionId: 'disrupt-idle-sick',
      eventType: 'TECHNICIAN_UNAVAILABLE',
      technicianId: techIdle.id,
      eventPayload: { reason: 'No jobs assigned yet' },
      activeAssignments: [],
      allJobs: [],
      technicians: [techIdle],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('RESOLVED');
    expect(result.metrics.affectedJobsCount).toBe(0);
    expect(result.metrics.recoveredJobsCount).toBe(0);
    expect(result.actions.length).toBe(0);
  });

  // -------------------------------------------------------------
  // TEST: Multi-Job Cascading Recovery Across Multiple Peers
  // -------------------------------------------------------------
  it('distributes multiple affected jobs across multiple eligible backup technicians when primary is unavailable', () => {
    const jobA = {
      id: 'multi-job-a',
      customerName: 'Multi Client A',
      description: 'HVAC morning fix',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T12:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T12:00:00.000Z'),
      status: 'ASSIGNED',
    };

    const jobB = {
      id: 'multi-job-b',
      customerName: 'Multi Client B',
      description: 'Electrical afternoon fix',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T13:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T17:00:00.000Z'),
      status: 'ASSIGNED',
    };

    const initialAssignments = [
      {
        jobId: jobA.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T09:30:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: jobA,
      },
      {
        jobId: jobB.id,
        technicianId: techAlpha.id,
        scheduledStart: new Date('2026-11-02T13:30:00.000Z'),
        scheduledEnd: new Date('2026-11-02T14:30:00.000Z'),
        travelTime: 10,
        status: 'SCHEDULED',
        job: jobB,
      },
    ];

    const result = runRecoveryEngine({
      disruptionId: 'disrupt-multi-job',
      eventType: 'TECHNICIAN_UNAVAILABLE',
      technicianId: techAlpha.id,
      eventPayload: { reason: 'Alpha vehicle breakdown' },
      activeAssignments: initialAssignments,
      allJobs: [jobA, jobB],
      technicians: [techAlpha, techBeta],
      options: { referenceDate: refDate },
    });

    expect(result.recoveryStatus).toBe('RESOLVED');
    expect(result.metrics.affectedJobsCount).toBe(2);
    expect(result.metrics.recoveredJobsCount).toBe(2);
    expect(result.updatedAssignments.length).toBe(2);

    // Both jobs should now be safely handled by techBeta without overlapping
    const asgnA = result.updatedAssignments.find((a) => a.jobId === jobA.id);
    const asgnB = result.updatedAssignments.find((a) => a.jobId === jobB.id);

    expect(asgnA?.technicianId).toBe(techBeta.id);
    expect(asgnB?.technicianId).toBe(techBeta.id);

    // Overlap check
    expect(
      asgnA!.scheduledEnd.getTime() <= asgnB!.scheduledStart.getTime() ||
      asgnB!.scheduledEnd.getTime() <= asgnA!.scheduledStart.getTime()
    ).toBe(true);
  });
});
