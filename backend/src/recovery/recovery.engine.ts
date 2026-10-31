import { randomUUID } from 'crypto';
import { calculateTravelEstimate } from '../scheduling/travel-calculator';
import { findEligibleTechnicians } from '../scheduling/technician-eligibility';
import { generateFeasibleSlots } from '../scheduling/slot-generator';
import { validateHardConstraints } from '../scheduling/constraint-validator';
import { getShiftWindowForDate } from '../scheduling/scheduling.engine';
import { InMemTechnicianSchedule, InMemCommitment } from '../scheduling/scheduling.types';
import { identifyAffectedJobs, DisruptionEventContext } from './affected-jobs-detector';
import { createRecoveryExplanation, getFailureSuggestedAction } from './recovery-explainer';
import {
  AffectedJobInfo,
  DisruptionEventType,
  DisruptionRecoveryStatus,
  RecoveryAction,
  RecoveryActionType,
  RecoveryEngineOptions,
  RecoveryEngineResult,
  RecoveryFailureCode,
  RecoveryMetrics,
} from './recovery.types';

export interface RecoveryEngineInput {
  disruptionId: string;
  eventType: DisruptionEventType;
  technicianId?: string | null;
  jobId?: string | null;
  eventPayload?: any;
  activeAssignments: any[];
  allJobs: any[];
  technicians: any[];
  options?: RecoveryEngineOptions;
}

/**
 * Pure, in-memory Intelligent Recovery Engine for DispatchGrid.
 * 
 * Implements targeted, constraint-preserving recovery across all 6 disruption scenarios.
 */
export function runRecoveryEngine(input: RecoveryEngineInput): RecoveryEngineResult {
  const startTime = Date.now();
  const runId = input.options?.runId || randomUUID();
  const refDate = input.options?.referenceDate || new Date('2026-11-02T00:00:00.000Z');

  const {
    disruptionId,
    eventType,
    technicianId,
    jobId,
    eventPayload,
    activeAssignments,
    allJobs,
    technicians,
  } = input;

  const jobMap = new Map(allJobs.map((j) => [j.id, { ...j }]));
  const techMap = new Map(technicians.map((t) => [t.id, { ...t }]));

  // 1. Identify Affected Jobs
  const eventContext: DisruptionEventContext = {
    eventType,
    technicianId,
    jobId,
    eventPayload,
  };

  const affectedJobs = identifyAffectedJobs(
    eventContext,
    activeAssignments,
    allJobs,
    technicians
  );

  const actions: RecoveryAction[] = [];
  const updatedAssignments: Array<{
    jobId: string;
    technicianId: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    travelTime: number;
    status: string;
  }> = [];

  const cancelledJobIds: string[] = [];
  const unassignedJobIds: string[] = [];

  // Track SLA violations before
  let slaViolationsBefore = 0;
  let travelMinutesBefore = 0;
  for (const asgn of activeAssignments) {
    travelMinutesBefore += asgn.travelTime || 0;
    const job = jobMap.get(asgn.jobId);
    if (job && new Date(asgn.scheduledEnd).getTime() > new Date(job.slaDeadline).getTime()) {
      slaViolationsBefore++;
    }
  }

  // Build working technician schedule map
  const schedules = new Map<string, InMemTechnicianSchedule>();

  for (const tech of technicians) {
    const isUnavailable =
      eventType === 'TECHNICIAN_UNAVAILABLE' && tech.id === technicianId;

    const { shiftStartUtc, shiftEndUtc, totalShiftMinutes } = getShiftWindowForDate(
      tech.shiftStart,
      tech.shiftEnd,
      refDate
    );

    const commitments: InMemCommitment[] = [];

    // Add unavailabilities
    if (Array.isArray(tech.unavailabilities)) {
      for (const u of tech.unavailabilities) {
        commitments.push({
          id: u.id,
          type: 'UNAVAILABILITY',
          startTime: new Date(u.startTime),
          endTime: new Date(u.endTime),
        });
      }
    }

    // Add existing assignments not affected or already completed/in-progress
    const techAsgns = activeAssignments.filter(
      (a) => a.technicianId === tech.id && a.status !== 'CANCELLED'
    );

    for (const a of techAsgns) {
      const isAffectedUnprotected = affectedJobs.some(
        (aff) => aff.jobId === a.jobId && !aff.isProtected
      );

      // Keep in schedule if not affected or if protected
      if (!isAffectedUnprotected) {
        const j = jobMap.get(a.jobId);
        let endTime = new Date(a.scheduledEnd);
        if (a.jobId === jobId) {
          if (eventPayload?.delayedUntil) {
            endTime = new Date(eventPayload.delayedUntil);
          } else if (eventPayload?.newDurationMinutes) {
            endTime = new Date(new Date(a.scheduledStart).getTime() + eventPayload.newDurationMinutes * 60000);
          } else if (eventPayload?.delayMinutes) {
            endTime = new Date(endTime.getTime() + eventPayload.delayMinutes * 60000);
          }
        }

        commitments.push({
          id: a.id,
          jobId: a.jobId,
          type: 'ASSIGNMENT',
          startTime: new Date(a.scheduledStart),
          endTime,
          location: j ? { latitude: j.latitude, longitude: j.longitude } : undefined,
          status: a.status,
        });

        updatedAssignments.push({
          jobId: a.jobId,
          technicianId: a.technicianId,
          scheduledStart: new Date(a.scheduledStart),
          scheduledEnd: endTime,
          travelTime: a.travelTime || 0,
          status: a.status,
        });
      }
    }

    schedules.set(tech.id, {
      technicianId: tech.id,
      name: tech.name,
      homeLocation: { latitude: tech.latitude, longitude: tech.longitude },
      shiftStartUtc,
      shiftEndUtc,
      totalShiftMinutes,
      allocatedMinutes: 0,
      travelMinutes: 0,
      commitments,
    });
  }

  // Handle protected affected jobs (COMPLETED or IN_PROGRESS)
  for (const aff of affectedJobs) {
    if (aff.isProtected) {
      let revisedEnd = aff.scheduledEnd;
      if (aff.jobId === jobId) {
        if (eventPayload?.delayedUntil) {
          revisedEnd = new Date(eventPayload.delayedUntil);
        } else if (eventPayload?.newDurationMinutes && aff.scheduledStart) {
          revisedEnd = new Date(aff.scheduledStart.getTime() + eventPayload.newDurationMinutes * 60000);
        } else if (eventPayload?.delayMinutes && revisedEnd) {
          revisedEnd = new Date(revisedEnd.getTime() + eventPayload.delayMinutes * 60000);
        }
      }

      actions.push({
        jobId: aff.jobId,
        customerName: aff.customerName,
        priority: aff.priority,
        actionType: 'MAINTAIN',
        previousTechnicianId: aff.currentTechnicianId,
        previousTechnicianName: aff.currentTechnicianName,
        newTechnicianId: aff.currentTechnicianId,
        newTechnicianName: aff.currentTechnicianName,
        previousStart: aff.scheduledStart,
        previousEnd: aff.scheduledEnd,
        newStart: aff.scheduledStart,
        newEnd: revisedEnd,
        travelTimeMinutes: 0,
        explanation: `Protected assignment (${aff.status}) preserved${revisedEnd !== aff.scheduledEnd ? ' with updated completion window' : ' without modifications'}.`,
        slaPreserved: true,
        slaBufferMinutes: revisedEnd
          ? Math.round((aff.slaDeadline.getTime() - revisedEnd.getTime()) / 60000)
          : 0,
      });
    }
  }

  // =========================================================================
  // SCENARIO D SPECIAL CASE: JOB CANCELLED
  // =========================================================================
  if (eventType === 'JOB_CANCELLED' && jobId) {
    cancelledJobIds.push(jobId);
    const targetAff = affectedJobs.find((a) => a.jobId === jobId);
    if (targetAff) {
      actions.push({
        jobId,
        customerName: targetAff.customerName,
        priority: targetAff.priority,
        actionType: 'CANCEL',
        previousTechnicianId: targetAff.currentTechnicianId,
        previousTechnicianName: targetAff.currentTechnicianName,
        newTechnicianId: null,
        newTechnicianName: null,
        previousStart: targetAff.scheduledStart,
        previousEnd: targetAff.scheduledEnd,
        newStart: null,
        newEnd: null,
        travelTimeMinutes: 0,
        explanation: 'Work order cancelled. Assignment removed and slot released.',
        slaPreserved: true,
        slaBufferMinutes: 0,
      });
    }
  }

  // Filter jobs requiring active recovery (unprotected and not cancelled)
  const jobsToRecover = affectedJobs.filter(
    (a) => !a.isProtected && a.jobId !== jobId || (eventType !== 'JOB_CANCELLED' && !a.isProtected)
  );

  // If urgent job arrival and job wasn't in affectedJobs (e.g. payload newly created job)
  if (eventType === 'URGENT_JOB_ARRIVAL') {
    const existingInAffected = jobsToRecover.some((j) => j.jobId === jobId);
    if (!existingInAffected) {
      const urgentJob = jobId ? jobMap.get(jobId) : eventPayload?.job;
      if (urgentJob) {
        jobsToRecover.unshift({
          jobId: urgentJob.id,
          customerName: urgentJob.customerName,
          priority: urgentJob.priority,
          serviceZone: urgentJob.serviceZone,
          requiredSkills: typeof urgentJob.requiredSkills === 'string'
            ? JSON.parse(urgentJob.requiredSkills)
            : urgentJob.requiredSkills || [],
          estimatedDuration: urgentJob.estimatedDuration,
          currentTechnicianId: null,
          currentTechnicianName: null,
          scheduledStart: null,
          scheduledEnd: null,
          slaDeadline: new Date(urgentJob.slaDeadline),
          status: 'PENDING',
          isProtected: false,
          cause: 'New urgent priority request requires dispatch.',
        });
      }
    }
  }

  // Exclude unavailable technician from taking any recovery assignments
  const activeTechPool = technicians.filter((t) => {
    if (eventType === 'TECHNICIAN_UNAVAILABLE' && t.id === technicianId) return false;
    return t.availabilityStatus !== 'OFF_DUTY' && t.availabilityStatus !== 'UNAVAILABLE';
  });

  // Sort jobs requiring recovery by priority (CRITICAL > HIGH > MEDIUM > LOW) and tighter SLA
  jobsToRecover.sort((a, b) => {
    const pOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const pDiff = (pOrder[b.priority] || 0) - (pOrder[a.priority] || 0);
    if (pDiff !== 0) return pDiff;
    return a.slaDeadline.getTime() - b.slaDeadline.getTime();
  });

  // Reassign or slide each job
  for (const item of jobsToRecover) {
    if (cancelledJobIds.includes(item.jobId)) continue;

    const job = jobMap.get(item.jobId) || {
      id: item.jobId,
      customerName: item.customerName,
      priority: item.priority,
      serviceZone: item.serviceZone,
      requiredSkills: item.requiredSkills,
      estimatedDuration: item.estimatedDuration,
      earliestStart: item.scheduledStart || refDate,
      latestEnd: item.slaDeadline,
      slaDeadline: item.slaDeadline,
      latitude: eventPayload?.latitude || 37.7749,
      longitude: eventPayload?.longitude || -122.4194,
    };

    // If job duration changed in scenario C, update job estimatedDuration
    if (eventType === 'JOB_DURATION_CHANGED' && item.jobId === jobId && eventPayload?.newDurationMinutes) {
      job.estimatedDuration = eventPayload.newDurationMinutes;
    }

    // Step 1: Find eligible replacement technicians
    const eligibility = findEligibleTechnicians(job, activeTechPool);
    const eligibleTechs = eligibility.eligibleTechnicians;

    interface RecoveryCandidate {
      tech: any;
      slot: any;
      score: number;
      slaBufferMinutes: number;
    }

    const candidateSlots: RecoveryCandidate[] = [];

    for (const tech of eligibleTechs) {
      const schedule = schedules.get(tech.id);
      if (!schedule) continue;

      // Ensure shift window matches this job's date
      const shiftWindow = getShiftWindowForDate(
        tech.shiftStart,
        tech.shiftEnd,
        new Date(job.earliestStart || refDate)
      );
      schedule.shiftStartUtc = shiftWindow.shiftStartUtc;
      schedule.shiftEndUtc = shiftWindow.shiftEndUtc;

      const feasible = generateFeasibleSlots(job, schedule);

      for (const slot of feasible) {
        const validation = validateHardConstraints(job, tech, slot, schedule);
        if (validation.isValid) {
          const slaBuffer = Math.round(
            (new Date(job.slaDeadline).getTime() - slot.scheduledEnd.getTime()) / 60000
          );
          // Score: heavily reward positive SLA buffer, penalize travel time
          const score = slaBuffer * 2 - slot.travelTimeMinutes;
          candidateSlots.push({
            tech,
            slot,
            score,
            slaBufferMinutes: slaBuffer,
          });
        }
      }
    }

    if (candidateSlots.length > 0) {
      // Pick best slot: highest score (greatest SLA buffer, least travel)
      candidateSlots.sort((a, b) => b.score - a.score);
      const winner = candidateSlots[0];

      // Update winning technician's in-memory commitments
      const winSchedule = schedules.get(winner.tech.id)!;
      winSchedule.commitments.push({
        id: `recov-${job.id}`,
        jobId: job.id,
        type: 'ASSIGNMENT',
        startTime: winner.slot.scheduledStart,
        endTime: winner.slot.scheduledEnd,
        location: { latitude: job.latitude, longitude: job.longitude },
        status: 'SCHEDULED',
      });

      const isSameTech = item.currentTechnicianId === winner.tech.id;
      const actionType: RecoveryActionType = eventType === 'URGENT_JOB_ARRIVAL' && !item.currentTechnicianId
        ? 'DISPATCH_NEW'
        : isSameTech
        ? 'SLIDE_WINDOW'
        : 'REASSIGN';

      const actionData = {
        jobId: job.id,
        customerName: job.customerName,
        priority: job.priority,
        actionType,
        previousTechnicianId: item.currentTechnicianId,
        previousTechnicianName: item.currentTechnicianName,
        newTechnicianId: winner.tech.id,
        newTechnicianName: winner.tech.name,
        previousStart: item.scheduledStart,
        previousEnd: item.scheduledEnd,
        newStart: winner.slot.scheduledStart,
        newEnd: winner.slot.scheduledEnd,
        travelTimeMinutes: winner.slot.travelTimeMinutes,
        slaPreserved: winner.slaBufferMinutes >= 0,
        slaBufferMinutes: winner.slaBufferMinutes,
      };

      actions.push({
        ...actionData,
        explanation: createRecoveryExplanation(actionData),
      });

      updatedAssignments.push({
        jobId: job.id,
        technicianId: winner.tech.id,
        scheduledStart: winner.slot.scheduledStart,
        scheduledEnd: winner.slot.scheduledEnd,
        travelTime: winner.slot.travelTimeMinutes,
        status: 'SCHEDULED',
      });
    } else {
      // Could not recover job within hard constraints
      unassignedJobIds.push(job.id);

      let failureCode: RecoveryFailureCode = 'NO_FEASIBLE_TIME_SLOT';
      if (eligibleTechs.length === 0) {
        failureCode = 'REQUIRED_SKILL_UNAVAILABLE';
      }

      const suggestedAction = getFailureSuggestedAction(failureCode);

      const actionData = {
        jobId: job.id,
        customerName: job.customerName,
        priority: job.priority,
        actionType: 'MARK_UNASSIGNED' as const,
        previousTechnicianId: item.currentTechnicianId,
        previousTechnicianName: item.currentTechnicianName,
        newTechnicianId: null,
        newTechnicianName: null,
        previousStart: item.scheduledStart,
        previousEnd: item.scheduledEnd,
        newStart: null,
        newEnd: null,
        travelTimeMinutes: 0,
        slaPreserved: false,
        slaBufferMinutes: 0,
        failureCode,
        suggestedAction,
      };

      actions.push({
        ...actionData,
        explanation: createRecoveryExplanation(actionData),
      });
    }
  }

  // 4. Calculate Final Recovery Metrics
  const affectedJobsCount = affectedJobs.length;
  const recoveredJobsCount = actions.filter(
    (a) => a.actionType === 'REASSIGN' || a.actionType === 'SLIDE_WINDOW' || a.actionType === 'DISPATCH_NEW'
  ).length;
  const unrecoveredJobsCount = unassignedJobIds.length;
  const changedAssignmentsCount = actions.filter(
    (a) => a.actionType === 'REASSIGN' || a.actionType === 'SLIDE_WINDOW' || a.actionType === 'CANCEL'
  ).length;
  const unchangedAssignmentsCount = Math.max(0, activeAssignments.length - changedAssignmentsCount);

  let slaViolationsAfter = 0;
  let travelMinutesAfter = 0;
  for (const asgn of updatedAssignments) {
    travelMinutesAfter += asgn.travelTime || 0;
    const j = jobMap.get(asgn.jobId);
    if (j && new Date(asgn.scheduledEnd).getTime() > new Date(j.slaDeadline).getTime()) {
      slaViolationsAfter++;
    }
  }

  const recoverableCount = jobsToRecover.length;
  const recoverySuccessRate = recoverableCount > 0
    ? Math.round((recoveredJobsCount / recoverableCount) * 10000) / 100
    : 100.0;

  let recoveryStatus: DisruptionRecoveryStatus = 'RESOLVED';
  if (unrecoveredJobsCount > 0 && recoveredJobsCount > 0) {
    recoveryStatus = 'PARTIALLY_RESOLVED';
  } else if (unrecoveredJobsCount > 0 && recoveredJobsCount === 0) {
    recoveryStatus = 'FAILED';
  }

  const durationMs = Date.now() - startTime;

  const metrics: RecoveryMetrics = {
    affectedJobsCount,
    recoveredJobsCount,
    unrecoveredJobsCount,
    changedAssignmentsCount,
    unchangedAssignmentsCount,
    slaViolationsBefore,
    slaViolationsAfter,
    travelMinutesBefore,
    travelMinutesAfter,
    technicianUtilizationBefore: 0, // Computed at service boundary
    technicianUtilizationAfter: 0,
    overtimeMinutesBefore: 0,
    overtimeMinutesAfter: 0,
    recoverySuccessRate,
    durationMs,
  };

  return {
    runId,
    disruptionId,
    eventType,
    recoveryStatus,
    metrics,
    actions,
    affectedJobs,
    updatedAssignments,
    cancelledJobIds,
    unassignedJobIds,
    timestamp: new Date().toISOString(),
  };
}
