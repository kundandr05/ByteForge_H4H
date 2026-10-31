import { Coordinates } from '../scheduling/scheduling.types';

export type OptimizationOperationType =
  | 'REORDER_ROUTE'
  | 'MOVE_TIME_SLOT'
  | 'REASSIGN_TECHNICIAN'
  | 'SWAP_JOBS'
  | 'ASSIGN_UNASSIGNED';

export type OptimizationRejectionCode =
  | 'SKILL_MISMATCH'
  | 'SHIFT_CONFLICT'
  | 'TIME_WINDOW_CONFLICT'
  | 'SLA_CONFLICT'
  | 'TRAVEL_TIME_CONFLICT'
  | 'OVERLAPPING_ASSIGNMENT'
  | 'NO_OBJECTIVE_IMPROVEMENT'
  | 'PROTECTED_ASSIGNMENT';

export interface OptimizationWeights {
  slaLateness: number;          // Default: 0.35 (35%)
  travelEfficiency: number;     // Default: 0.25 (25%)
  unassignedPriority: number;   // Default: 0.15 (15%)
  workloadBalance: number;      // Default: 0.10 (10%)
  overtime: number;             // Default: 0.10 (10%)
  scheduleStability: number;    // Default: 0.05 (5%)
}

export const DEFAULT_OPTIMIZATION_WEIGHTS: OptimizationWeights = {
  slaLateness: 0.35,
  travelEfficiency: 0.25,
  unassignedPriority: 0.15,
  workloadBalance: 0.10,
  overtime: 0.10,
  scheduleStability: 0.05,
};

export interface ObjectiveScoreBreakdown {
  slaLatenessScore: number;       // 0.0 to 1.0 (1.0 = zero late jobs & generous SLA buffer)
  travelEfficiencyScore: number;  // 0.0 to 1.0 (1.0 = minimal travel distance/time)
  unassignedPriorityScore: number;// 0.0 to 1.0 (1.0 = zero unassigned CRITICAL/HIGH jobs)
  workloadBalanceScore: number;   // 0.0 to 1.0 (1.0 = perfectly balanced shift utilization)
  overtimeScore: number;          // 0.0 to 1.0 (1.0 = zero shift boundary exceedances)
  stabilityScore: number;         // 0.0 to 1.0 (1.0 = no unnecessary churn relative to baseline)
  totalQualityScore: number;      // 0.0 to 100.0 (Higher is strictly better)
}

export interface ScheduleMetricsSnapshot {
  totalJobs: number;
  assignedJobs: number;
  unassignedJobs: number;
  criticalJobsAssigned: number;
  highJobsAssigned: number;
  totalTravelDistanceKm: number;
  totalTravelMinutes: number;
  averageTravelMinutes: number;
  slaViolations: number;
  lateJobs: number;
  technicianUtilization: number;    // Percentage 0 - 100
  workloadVariance: number;         // Variance of allocated minutes across techs
  workloadStdDevMinutes: number;    // Standard deviation in minutes
  overtimeMinutes: number;
  assignmentChangesCount: number;
  qualityScore: number;             // 0.0 to 100.0
  scoreBreakdown: ObjectiveScoreBreakdown;
}

export interface MetricComparisonItem<T = number> {
  baseline: T;
  optimized: T;
  absoluteDiff: number;
  percentDiff: number | null; // null if baseline is 0
  improved: boolean;
}

export interface ScheduleComparison {
  metrics: {
    totalJobs: MetricComparisonItem;
    assignedJobs: MetricComparisonItem;
    unassignedJobs: MetricComparisonItem;
    criticalJobsAssigned: MetricComparisonItem;
    highJobsAssigned: MetricComparisonItem;
    totalTravelDistanceKm: MetricComparisonItem;
    totalTravelMinutes: MetricComparisonItem;
    averageTravelMinutes: MetricComparisonItem;
    slaViolations: MetricComparisonItem;
    lateJobs: MetricComparisonItem;
    technicianUtilization: MetricComparisonItem;
    workloadStdDevMinutes: MetricComparisonItem;
    overtimeMinutes: MetricComparisonItem;
    qualityScore: MetricComparisonItem;
  };
  scoreImprovement: number;
  scoreImprovementPercent: number | null;
  totalAssignmentsChanged: number;
  totalAssignmentsUnchanged: number;
  isImproved: boolean;
}

export interface AssignmentChangeRecord {
  jobId: string;
  customerName: string;
  priority: string;
  previousTechnicianId: string | null;
  previousTechnicianName: string | null;
  newTechnicianId: string;
  newTechnicianName: string;
  previousStart: Date | null;
  previousEnd: Date | null;
  newStart: Date;
  newEnd: Date;
  operationType: OptimizationOperationType;
  reason: string;
  travelImpactMinutes: number; // Negative = reduced travel
  workloadImpactMinutes: number;
  slaImpactMinutes: number; // Positive = extra SLA buffer gained
  scoreDelta: number;
}

export interface RejectedOperationRecord {
  jobId: string;
  customerName: string;
  operationType: OptimizationOperationType;
  targetTechnicianId?: string;
  targetTechnicianName?: string;
  rejectionCode: OptimizationRejectionCode;
  reason: string;
}

export interface OptimizationEngineOptions {
  maxIterations?: number;
  maxDurationMs?: number;
  minImprovementThreshold?: number;
  weights?: Partial<OptimizationWeights>;
  referenceDate?: Date;
  runId?: string;
}

export interface OptimizationEngineResult {
  runId: string;
  status: 'COMPLETED' | 'NO_IMPROVEMENT' | 'TIMEOUT';
  iterationsExecuted: number;
  durationMs: number;
  baselineMetrics: ScheduleMetricsSnapshot;
  optimizedMetrics: ScheduleMetricsSnapshot;
  comparison: ScheduleComparison;
  changes: AssignmentChangeRecord[];
  rejectedOperations: RejectedOperationRecord[];
  optimizedAssignments: Array<{
    jobId: string;
    technicianId: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    travelTime: number;
    status: string;
  }>;
}
