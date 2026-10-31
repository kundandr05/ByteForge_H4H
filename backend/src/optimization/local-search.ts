import { evaluateScheduleState, EvaluatedAssignment } from './optimization.objective';
import { generateCandidateMoves } from './candidate-generator';
import { createAssignmentChangeExplanation } from './optimization-explainer';
import {
  AssignmentChangeRecord,
  OptimizationEngineOptions,
  OptimizationWeights,
  RejectedOperationRecord,
  ScheduleMetricsSnapshot,
} from './optimization.types';

export interface LocalSearchResult {
  optimizedAssignments: EvaluatedAssignment[];
  baselineMetrics: ScheduleMetricsSnapshot;
  optimizedMetrics: ScheduleMetricsSnapshot;
  iterationsExecuted: number;
  changes: AssignmentChangeRecord[];
  rejectedOperations: RejectedOperationRecord[];
  status: 'COMPLETED' | 'NO_IMPROVEMENT' | 'TIMEOUT';
}

/**
 * Deterministic local search optimizer.
 * Iteratively improves schedule quality score using hill climbing with strict
 * hard constraint guarantees and convergence detection.
 */
export function runLocalSearchOptimization(
  initialAssignments: EvaluatedAssignment[],
  allJobs: any[],
  technicians: any[],
  options: OptimizationEngineOptions = {},
  weights: OptimizationWeights
): LocalSearchResult {
  const maxIterations = options.maxIterations || 50;
  const maxDurationMs = options.maxDurationMs || 5000;
  const minImprovementThreshold = options.minImprovementThreshold || 0.05;
  const refDate = options.referenceDate || new Date('2026-11-02T00:00:00.000Z');
  const startTime = Date.now();

  // Evaluate baseline
  const baselineMetrics = evaluateScheduleState(
    {
      assignments: initialAssignments,
      allJobs,
      technicians,
      baselineAssignments: initialAssignments,
    },
    weights
  );

  let currentAssignments = [...initialAssignments];
  let currentMetrics = baselineMetrics;
  const changes: AssignmentChangeRecord[] = [];
  const rejectedOperations: RejectedOperationRecord[] = [];

  let iteration = 0;
  let status: 'COMPLETED' | 'NO_IMPROVEMENT' | 'TIMEOUT' = 'COMPLETED';

  while (iteration < maxIterations) {
    if (Date.now() - startTime >= maxDurationMs) {
      status = 'TIMEOUT';
      break;
    }

    iteration++;

    // Generate candidate moves
    const candidates = generateCandidateMoves(
      currentAssignments,
      allJobs,
      technicians,
      refDate
    );

    if (candidates.length === 0) {
      if (iteration === 1) status = 'NO_IMPROVEMENT';
      break;
    }

    // Evaluate all candidates
    interface EvaluatedCandidate {
      candidate: typeof candidates[0];
      newMetrics: ScheduleMetricsSnapshot;
      scoreDelta: number;
    }

    const evaluatedCandidates: EvaluatedCandidate[] = [];

    for (const c of candidates) {
      const newMetrics = evaluateScheduleState(
        {
          assignments: c.newAssignments,
          allJobs,
          technicians,
          baselineAssignments: initialAssignments,
        },
        weights
      );

      const scoreDelta = newMetrics.qualityScore - currentMetrics.qualityScore;

      if (scoreDelta >= minImprovementThreshold) {
        evaluatedCandidates.push({
          candidate: c,
          newMetrics,
          scoreDelta,
        });
      } else {
        rejectedOperations.push({
          jobId: c.affectedJobId,
          customerName: c.affectedJob.customerName,
          operationType: c.operationType,
          targetTechnicianId: c.newTech.id,
          targetTechnicianName: c.newTech.name,
          rejectionCode: 'NO_OBJECTIVE_IMPROVEMENT',
          reason: `Move yields score delta of ${Math.round(scoreDelta * 100) / 100}, which is below the threshold of ${minImprovementThreshold}.`,
        });
      }
    }

    if (evaluatedCandidates.length === 0) {
      if (iteration === 1) status = 'NO_IMPROVEMENT';
      break;
    }

    // Sort evaluated candidates deterministically:
    // 1. Highest scoreDelta
    // 2. Lexicographical operationType
    // 3. Lexicographical jobId
    evaluatedCandidates.sort((a, b) => {
      if (b.scoreDelta !== a.scoreDelta) return b.scoreDelta - a.scoreDelta;
      if (a.candidate.operationType !== b.candidate.operationType) {
        return a.candidate.operationType.localeCompare(b.candidate.operationType);
      }
      return a.candidate.affectedJobId.localeCompare(b.candidate.affectedJobId);
    });

    // Accept best move
    const best = evaluatedCandidates[0];
    currentAssignments = best.candidate.newAssignments;
    currentMetrics = best.newMetrics;

    const changeExplanation = createAssignmentChangeExplanation(
      best.candidate.affectedJob,
      best.candidate.prevTech,
      best.candidate.newTech,
      best.candidate.prevStart,
      best.candidate.prevEnd,
      best.candidate.newStart,
      best.candidate.newEnd,
      best.candidate.operationType,
      best.candidate.travelImpactMinutes,
      best.candidate.workloadImpactMinutes,
      best.candidate.slaImpactMinutes,
      best.scoreDelta
    );
    changes.push(changeExplanation);
  }

  return {
    optimizedAssignments: currentAssignments,
    baselineMetrics,
    optimizedMetrics: currentMetrics,
    iterationsExecuted: iteration,
    changes,
    rejectedOperations,
    status,
  };
}
