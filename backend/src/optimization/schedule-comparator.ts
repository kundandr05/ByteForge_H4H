import {
  MetricComparisonItem,
  ScheduleComparison,
  ScheduleMetricsSnapshot,
} from './optimization.types';

function createComparisonItem(
  baseline: number,
  optimized: number,
  higherIsBetter: boolean
): MetricComparisonItem {
  const absoluteDiff = Math.round((optimized - baseline) * 100) / 100;
  const percentDiff = baseline !== 0
    ? Math.round(((optimized - baseline) / Math.abs(baseline)) * 1000) / 10
    : null;
  const improved = higherIsBetter ? absoluteDiff >= 0 : absoluteDiff <= 0;

  return {
    baseline,
    optimized,
    absoluteDiff,
    percentDiff,
    improved,
  };
}

/**
 * Computes detailed before-and-after metrics comparisons between baseline
 * and optimized schedules. Handles zero denominators safely without NaN or Infinity.
 */
export function compareSchedules(
  baseline: ScheduleMetricsSnapshot,
  optimized: ScheduleMetricsSnapshot
): ScheduleComparison {
  const scoreImprovement = Math.round((optimized.qualityScore - baseline.qualityScore) * 100) / 100;
  const scoreImprovementPercent = baseline.qualityScore > 0
    ? Math.round((scoreImprovement / baseline.qualityScore) * 1000) / 10
    : null;

  const totalAssignmentsChanged = optimized.assignmentChangesCount;
  const totalAssignmentsUnchanged = Math.max(0, baseline.assignedJobs - totalAssignmentsChanged);
  const isImproved = scoreImprovement >= 0;

  return {
    metrics: {
      totalJobs: createComparisonItem(baseline.totalJobs, optimized.totalJobs, true),
      assignedJobs: createComparisonItem(baseline.assignedJobs, optimized.assignedJobs, true),
      unassignedJobs: createComparisonItem(baseline.unassignedJobs, optimized.unassignedJobs, false),
      criticalJobsAssigned: createComparisonItem(baseline.criticalJobsAssigned, optimized.criticalJobsAssigned, true),
      highJobsAssigned: createComparisonItem(baseline.highJobsAssigned, optimized.highJobsAssigned, true),
      totalTravelDistanceKm: createComparisonItem(baseline.totalTravelDistanceKm, optimized.totalTravelDistanceKm, false),
      totalTravelMinutes: createComparisonItem(baseline.totalTravelMinutes, optimized.totalTravelMinutes, false),
      averageTravelMinutes: createComparisonItem(baseline.averageTravelMinutes, optimized.averageTravelMinutes, false),
      slaViolations: createComparisonItem(baseline.slaViolations, optimized.slaViolations, false),
      lateJobs: createComparisonItem(baseline.lateJobs, optimized.lateJobs, false),
      technicianUtilization: createComparisonItem(baseline.technicianUtilization, optimized.technicianUtilization, true),
      workloadStdDevMinutes: createComparisonItem(baseline.workloadStdDevMinutes, optimized.workloadStdDevMinutes, false),
      overtimeMinutes: createComparisonItem(baseline.overtimeMinutes, optimized.overtimeMinutes, false),
      qualityScore: createComparisonItem(baseline.qualityScore, optimized.qualityScore, true),
    },
    scoreImprovement,
    scoreImprovementPercent,
    totalAssignmentsChanged,
    totalAssignmentsUnchanged,
    isImproved,
  };
}
