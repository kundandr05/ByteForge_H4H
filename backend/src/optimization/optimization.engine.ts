import { randomUUID } from 'crypto';
import {
  DEFAULT_OPTIMIZATION_WEIGHTS,
  OptimizationEngineOptions,
  OptimizationEngineResult,
  OptimizationWeights,
} from './optimization.types';
import { EvaluatedAssignment } from './optimization.objective';
import { runLocalSearchOptimization } from './local-search';
import { compareSchedules } from './schedule-comparator';

/**
 * Pure, in-memory Assignment Optimization Engine for DispatchGrid.
 * 
 * Takes an active schedule and executes deterministic local search to improve
 * SLA buffers, travel efficiency, workload balance, and priority fulfilment
 * while strictly safeguarding all 12 hard constraints.
 */
export function runOptimizationEngine(
  currentAssignments: any[],
  allJobs: any[],
  technicians: any[],
  options: OptimizationEngineOptions = {}
): OptimizationEngineResult {
  const startTime = Date.now();
  const runId = options.runId || randomUUID();
  const weights: OptimizationWeights = {
    ...DEFAULT_OPTIMIZATION_WEIGHTS,
    ...(options.weights || {}),
  };

  // Convert raw DB or in-memory assignments to EvaluatedAssignment instances
  const initialEvaluated: EvaluatedAssignment[] = currentAssignments.map((a) => {
    const job = a.job || allJobs.find((j) => j.id === a.jobId);
    return {
      jobId: a.jobId,
      technicianId: a.technicianId,
      scheduledStart: new Date(a.scheduledStart),
      scheduledEnd: new Date(a.scheduledEnd),
      travelTimeMinutes: a.travelTime || a.travelTimeMinutes || 0,
      travelDistanceKm: a.travelDistanceKm || 0,
      job,
      status: a.status || 'SCHEDULED',
    };
  });

  // Execute local search optimization
  const searchResult = runLocalSearchOptimization(
    initialEvaluated,
    allJobs,
    technicians,
    options,
    weights
  );

  // Compare before-and-after schedules
  const comparison = compareSchedules(
    searchResult.baselineMetrics,
    searchResult.optimizedMetrics
  );

  const durationMs = Date.now() - startTime;

  return {
    runId,
    status: searchResult.status,
    iterationsExecuted: searchResult.iterationsExecuted,
    durationMs,
    baselineMetrics: searchResult.baselineMetrics,
    optimizedMetrics: searchResult.optimizedMetrics,
    comparison,
    changes: searchResult.changes,
    rejectedOperations: searchResult.rejectedOperations,
    optimizedAssignments: searchResult.optimizedAssignments.map((a) => ({
      jobId: a.jobId,
      technicianId: a.technicianId,
      scheduledStart: a.scheduledStart,
      scheduledEnd: a.scheduledEnd,
      travelTime: a.travelTimeMinutes,
      status: a.status,
    })),
  };
}
