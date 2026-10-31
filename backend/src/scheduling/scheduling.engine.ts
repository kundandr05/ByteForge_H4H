import { randomUUID } from 'crypto';
import {
  CandidateSlot,
  Coordinates,
  DEFAULT_SCORING_WEIGHTS,
  InMemCommitment,
  InMemTechnicianSchedule,
  JobSchedulingDecision,
  SchedulingEngineMetrics,
  SchedulingEngineResult,
  ScoringWeights,
} from './scheduling.types';
import { calculateJobPriorityScore } from './job-priority';
import { findEligibleTechnicians } from './technician-eligibility';
import { generateFeasibleSlots } from './slot-generator';
import { validateHardConstraints } from './constraint-validator';
import { scoreCandidateSlot } from './assignment-scorer';
import {
  generateAssignmentExplanation,
  generateUnassignedExplanation,
} from './scheduling-explainer';
import { calculateSchedulingMetrics } from './scheduling-metrics';

export interface SchedulingEngineOptions {
  runId?: string;
  runType?: 'INITIAL' | 'OPTIMIZATION' | 'RECOVERY';
  weights?: ScoringWeights;
  referenceDate?: Date;
}

/**
 * Computes shift start and end UTC timestamps for a given date.
 */
export function getShiftWindowForDate(
  shiftStartStr: string,
  shiftEndStr: string,
  referenceDate: Date
): { shiftStartUtc: Date; shiftEndUtc: Date; totalShiftMinutes: number } {
  const validRefDate =
    referenceDate instanceof Date && !isNaN(referenceDate.getTime())
      ? referenceDate
      : new Date('2026-11-02T00:00:00.000Z');
  const dateStr = validRefDate.toISOString().substring(0, 10);
  const [startH, startM] = shiftStartStr.split(':').map((s) => parseInt(s, 10));
  const [endH, endM] = shiftEndStr.split(':').map((s) => parseInt(s, 10));

  const shiftStartUtc = new Date(`${dateStr}T00:00:00.000Z`);
  shiftStartUtc.setUTCHours(startH, startM, 0, 0);

  const shiftEndUtc = new Date(`${dateStr}T00:00:00.000Z`);
  shiftEndUtc.setUTCHours(endH, endM, 0, 0);

  if (shiftEndUtc.getTime() <= shiftStartUtc.getTime()) {
    shiftEndUtc.setUTCDate(shiftEndUtc.getUTCDate() + 1);
  }

  const totalShiftMinutes = Math.round(
    (shiftEndUtc.getTime() - shiftStartUtc.getTime()) / (60 * 1000)
  );

  return { shiftStartUtc, shiftEndUtc, totalShiftMinutes };
}

/**
 * Deterministic In-Memory Scheduling Engine for DispatchGrid.
 * 
 * Executes the complete 13-step optimization and constraint-satisfaction pipeline.
 */
export function runSchedulingEngine(
  jobs: any[],
  technicians: any[],
  options: SchedulingEngineOptions = {}
): SchedulingEngineResult {
  const startTime = Date.now();
  const runId = options.runId || randomUUID();
  const runType = options.runType || 'INITIAL';
  const weights = options.weights || DEFAULT_SCORING_WEIGHTS;

  // 1. Initialize In-Memory World State for all Technicians
  const schedules = new Map<string, InMemTechnicianSchedule>();

  for (const tech of technicians) {
    const homeLoc: Coordinates = {
      latitude: tech.latitude,
      longitude: tech.longitude,
    };

    // Reference shift window based on default date (Nov 2, 2026)
    const refDate = options.referenceDate || new Date('2026-11-02T00:00:00.000Z');
    const { shiftStartUtc, shiftEndUtc, totalShiftMinutes } = getShiftWindowForDate(
      tech.shiftStart,
      tech.shiftEnd,
      refDate
    );

    const commitments: InMemCommitment[] = [];

    // Add existing unavailability periods
    if (Array.isArray(tech.unavailabilities)) {
      for (const unavail of tech.unavailabilities) {
        commitments.push({
          id: unavail.id,
          type: 'UNAVAILABILITY',
          startTime: new Date(unavail.startTime),
          endTime: new Date(unavail.endTime),
        });
      }
    }

    // Add existing assignments (for OPTIMIZATION or RECOVERY runs)
    if (runType !== 'INITIAL' && Array.isArray(tech.assignments)) {
      for (const asgn of tech.assignments) {
        if (asgn.status !== 'CANCELLED') {
          commitments.push({
            id: asgn.id,
            jobId: asgn.jobId,
            type: 'ASSIGNMENT',
            startTime: new Date(asgn.scheduledStart),
            endTime: new Date(asgn.scheduledEnd),
            location: asgn.job
              ? { latitude: asgn.job.latitude, longitude: asgn.job.longitude }
              : undefined,
            status: asgn.status,
          });
        }
      }
    }

    schedules.set(tech.id, {
      technicianId: tech.id,
      name: tech.name,
      homeLocation: homeLoc,
      shiftStartUtc,
      shiftEndUtc,
      totalShiftMinutes,
      allocatedMinutes: 0,
      travelMinutes: 0,
      commitments,
    });
  }

  // 2. Filter Candidate Jobs
  // Exclude COMPLETED, CANCELLED, or IN_PROGRESS jobs
  const candidateJobs = jobs.filter(
    (j) => j.status !== 'COMPLETED' && j.status !== 'CANCELLED' && j.status !== 'IN_PROGRESS'
  );

  // 3. Deterministic Priority Sorting
  // Calculate priority and difficulty scores for each job
  const prioritizedJobs = candidateJobs.map((job) => {
    const eligibility = findEligibleTechnicians(job, technicians);
    const scored = calculateJobPriorityScore(
      job,
      eligibility.eligibleTechnicians.length,
      options.referenceDate || new Date(job.earliestStart)
    );
    return scored;
  });

  // Sort descending by total composite priority score, tie-breaking on job ID ascending
  prioritizedJobs.sort((a, b) => {
    if (b.totalCompositeScore !== a.totalCompositeScore) {
      return b.totalCompositeScore - a.totalCompositeScore;
    }
    return a.job.id.localeCompare(b.job.id);
  });

  // 4. Optimization & Slot Assignment Loop
  const decisions: JobSchedulingDecision[] = [];

  for (const { job } of prioritizedJobs) {
    const jobDate = new Date(job.earliestStart);
    const eligibility = findEligibleTechnicians(job, technicians);
    const eligibleTechnicians = eligibility.eligibleTechnicians;
    const allRejections = [...eligibility.rejectedTechnicians];

    interface CandidateTechOption {
      technician: any;
      schedule: InMemTechnicianSchedule;
      bestSlot: CandidateSlot;
      totalScore: number;
      scoreBreakdown: any;
    }

    const candidateOptions: CandidateTechOption[] = [];

    // Evaluate each eligible technician
    for (const tech of eligibleTechnicians) {
      const schedule = schedules.get(tech.id);
      if (!schedule) continue;

      // Adjust schedule shift boundaries to match this job's date
      const shiftWindow = getShiftWindowForDate(tech.shiftStart, tech.shiftEnd, jobDate);
      schedule.shiftStartUtc = shiftWindow.shiftStartUtc;
      schedule.shiftEndUtc = shiftWindow.shiftEndUtc;

      // Generate feasible appointment slots
      const feasibleSlots = generateFeasibleSlots(job, schedule);

      // Validate each slot against all 12 hard constraints
      const validSlots: Array<{ slot: CandidateSlot; score: number; breakdown: any }> = [];

      for (const slot of feasibleSlots) {
        const validation = validateHardConstraints(job, tech, slot, schedule);
        if (validation.isValid) {
          const { totalScore, breakdown } = scoreCandidateSlot(
            job,
            tech,
            slot,
            schedule,
            weights
          );
          validSlots.push({ slot, score: totalScore, breakdown });
        }
      }

      if (validSlots.length > 0) {
        // Choose best slot for this technician (highest score, tie-break by earliest start)
        validSlots.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.slot.scheduledStart.getTime() - b.slot.scheduledStart.getTime();
        });

        const best = validSlots[0];
        candidateOptions.push({
          technician: tech,
          schedule,
          bestSlot: best.slot,
          totalScore: best.score,
          scoreBreakdown: best.breakdown,
        });
      } else {
        allRejections.push({
          technicianId: tech.id,
          technicianName: tech.name,
          reason: 'No feasible time window found fitting technician shift, travel buffers, or commitments.',
        });
      }
    }

    // Determine winning candidate technician
    if (candidateOptions.length > 0) {
      // Sort candidates deterministically:
      // 1. Highest total optimization score
      // 2. Lowest travel time
      // 3. Lowest allocated workload (fair balancing)
      // 4. Technician ID lexicographical tie-breaker
      candidateOptions.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (a.bestSlot.travelTimeMinutes !== b.bestSlot.travelTimeMinutes) {
          return a.bestSlot.travelTimeMinutes - b.bestSlot.travelTimeMinutes;
        }
        if (a.schedule.allocatedMinutes !== b.schedule.allocatedMinutes) {
          return a.schedule.allocatedMinutes - b.schedule.allocatedMinutes;
        }
        return a.technician.id.localeCompare(b.technician.id);
      });

      const winner = candidateOptions[0];

      // Update winning technician's in-memory schedule
      winner.schedule.commitments.push({
        id: `asgn-${job.id}`,
        jobId: job.id,
        type: 'ASSIGNMENT',
        startTime: winner.bestSlot.scheduledStart,
        endTime: winner.bestSlot.scheduledEnd,
        location: { latitude: job.latitude, longitude: job.longitude },
        status: 'SCHEDULED',
      });

      winner.schedule.allocatedMinutes += job.estimatedDuration;
      winner.schedule.travelMinutes += winner.bestSlot.travelTimeMinutes;

      // Other eligible candidates are recorded as alternative candidates in rejection audit
      for (let i = 1; i < candidateOptions.length; i++) {
        const alt = candidateOptions[i];
        allRejections.push({
          technicianId: alt.technician.id,
          technicianName: alt.technician.name,
          reason: `Alternative eligible candidate (Score: ${alt.totalScore}/100, Travel: ${alt.bestSlot.travelTimeMinutes}m) lower ranked than selected candidate.`,
        });
      }

      decisions.push({
        jobId: job.id,
        customerName: job.customerName,
        priority: job.priority,
        isAssigned: true,
        selectedTechnicianId: winner.technician.id,
        selectedTechnicianName: winner.technician.name,
        selectedSlot: winner.bestSlot,
        assignmentScore: winner.totalScore,
        scoreBreakdown: winner.scoreBreakdown,
        explanation: generateAssignmentExplanation(
          job,
          winner.technician,
          winner.bestSlot,
          winner.scoreBreakdown
        ),
        rejectionReasons: allRejections,
      });
    } else {
      // Unassigned job
      const explanationResult = generateUnassignedExplanation(
        job,
        technicians,
        allRejections
      );

      decisions.push({
        jobId: job.id,
        customerName: job.customerName,
        priority: job.priority,
        isAssigned: false,
        explanation: explanationResult.explanation,
        rejectionReasons: allRejections,
        classification: explanationResult.classification,
        unassignedReasonCode: explanationResult.unassignedReasonCode,
        suggestedAction: explanationResult.suggestedAction,
      });
    }
  }

  // 5. Compute Metrics and Overall Objective Score
  const executionDurationMs = Date.now() - startTime;
  const metrics = calculateSchedulingMetrics(decisions, schedules, executionDurationMs);

  const assignedDecisions = decisions.filter((d) => d.isAssigned);
  const averageAssignedScore = assignedDecisions.length > 0
    ? assignedDecisions.reduce((sum, d) => sum + (d.assignmentScore || 0), 0) / assignedDecisions.length
    : 0;

  // Objective score blends average assignment quality with assignment rate
  const objectiveScore = Math.round(averageAssignedScore * (metrics.successRate / 100) * 100) / 100;

  return {
    runId,
    runType,
    objectiveScore,
    metrics,
    decisions,
    timestamp: new Date().toISOString(),
  };
}
