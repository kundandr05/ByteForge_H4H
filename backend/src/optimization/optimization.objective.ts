import {
  DEFAULT_OPTIMIZATION_WEIGHTS,
  ObjectiveScoreBreakdown,
  OptimizationWeights,
  ScheduleMetricsSnapshot,
} from './optimization.types';

export interface EvaluatedAssignment {
  jobId: string;
  technicianId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  travelTimeMinutes: number;
  travelDistanceKm: number;
  job: any;
  status: string;
}

export interface EvaluatedScheduleState {
  assignments: EvaluatedAssignment[];
  allJobs: any[];
  technicians: any[];
  baselineAssignments?: EvaluatedAssignment[];
}

/**
 * Computes comprehensive schedule metrics and the normalized multi-criteria
 * objective quality score (0.0 to 100.0).
 * 
 * Consistent Direction: Higher score is ALWAYS strictly better.
 */
export function evaluateScheduleState(
  state: EvaluatedScheduleState,
  weights: OptimizationWeights = DEFAULT_OPTIMIZATION_WEIGHTS
): ScheduleMetricsSnapshot {
  const { assignments, allJobs, technicians, baselineAssignments } = state;
  const totalJobs = allJobs.length;
  const assignedJobs = assignments.length;
  const unassignedJobs = Math.max(0, totalJobs - assignedJobs);

  let totalTravelMinutes = 0;
  let totalTravelDistanceKm = 0;
  let slaViolations = 0;
  let lateJobs = 0;
  let criticalJobsAssigned = 0;
  let highJobsAssigned = 0;
  let overtimeMinutes = 0;

  // Track workload per technician
  const techWorkloadMinutes = new Map<string, number>();
  for (const t of technicians) {
    techWorkloadMinutes.set(t.id, 0);
  }

  for (const asgn of assignments) {
    totalTravelMinutes += asgn.travelTimeMinutes;
    totalTravelDistanceKm += asgn.travelDistanceKm;

    const endMs = asgn.scheduledEnd.getTime();
    const slaMs = new Date(asgn.job.slaDeadline).getTime();

    if (endMs > slaMs) {
      slaViolations++;
      lateJobs++;
    }

    if (asgn.job.priority === 'CRITICAL') criticalJobsAssigned++;
    else if (asgn.job.priority === 'HIGH') highJobsAssigned++;

    const dur = asgn.job.estimatedDuration || 0;
    const currentWorkload = techWorkloadMinutes.get(asgn.technicianId) || 0;
    techWorkloadMinutes.set(asgn.technicianId, currentWorkload + dur);

    // Overtime check against shift end
    const tech = technicians.find((t) => t.id === asgn.technicianId);
    if (tech && tech.shiftEnd) {
      const [eh, em] = tech.shiftEnd.split(':').map(Number);
      const shiftEnd = new Date(asgn.scheduledEnd);
      shiftEnd.setUTCHours(eh, em, 0, 0);
      if (asgn.scheduledEnd.getTime() > shiftEnd.getTime()) {
        const extraMinutes = Math.round((asgn.scheduledEnd.getTime() - shiftEnd.getTime()) / 60000);
        overtimeMinutes += extraMinutes;
      }
    }
  }

  const averageTravelMinutes = assignedJobs > 0
    ? Math.round((totalTravelMinutes / assignedJobs) * 10) / 10
    : 0;

  // Workload variance & standard deviation
  const workloads = Array.from(techWorkloadMinutes.values());
  const activeTechs = technicians.filter(
    (t) => t.availabilityStatus !== 'OFF_DUTY' && t.availabilityStatus !== 'UNAVAILABLE'
  );
  const activeCount = Math.max(1, activeTechs.length);
  const meanWorkload = workloads.reduce((a, b) => a + b, 0) / activeCount;
  const variance = workloads.reduce((sum, w) => sum + Math.pow(w - meanWorkload, 2), 0) / activeCount;
  const workloadStdDevMinutes = Math.round(Math.sqrt(variance) * 10) / 10;

  // Overall technician utilization
  let totalShiftCapacityMinutes = 0;
  for (const t of activeTechs) {
    const [sh, sm] = t.shiftStart.split(':').map(Number);
    const [eh, em] = t.shiftEnd.split(':').map(Number);
    let shiftMins = (eh * 60 + em) - (sh * 60 + sm);
    if (shiftMins <= 0) shiftMins += 1440;
    totalShiftCapacityMinutes += shiftMins;
  }
  const totalAllocatedMinutes = workloads.reduce((a, b) => a + b, 0);
  const technicianUtilization = totalShiftCapacityMinutes > 0
    ? Math.round((totalAllocatedMinutes / totalShiftCapacityMinutes) * 10000) / 100
    : 0;

  // Count changed assignments relative to baseline (churn of already-scheduled jobs)
  let assignmentChangesCount = 0;
  if (baselineAssignments && baselineAssignments.length > 0) {
    const baselineMap = new Map(baselineAssignments.map((b) => [b.jobId, b]));
    for (const current of assignments) {
      const base = baselineMap.get(current.jobId);
      if (base) {
        if (
          base.technicianId !== current.technicianId ||
          Math.abs(base.scheduledStart.getTime() - current.scheduledStart.getTime()) > 60000
        ) {
          assignmentChangesCount++;
        }
      }
    }
  }

  // =========================================================================
  // NORMALIZED OBJECTIVE SUB-SCORES (Each in range [0.0, 1.0])
  // =========================================================================

  // 1. SLA & Lateness Score (Weight: 35%)
  // Perfect score (1.0) when 0 SLA violations. Each late job heavily degrades the score.
  const slaLatenessScore = Math.max(0.0, 1.0 - (slaViolations * 0.25 + lateJobs * 0.15));

  // 2. Travel Efficiency Score (Weight: 25%)
  // Benchmark: 45 minutes per job is maximum acceptable average. Shorter travel approaches 1.0.
  const MAX_BENCHMARK_TRAVEL_PER_JOB = 45;
  const travelEfficiencyScore = assignedJobs > 0
    ? Math.max(0.0, 1.0 - Math.min(1.0, averageTravelMinutes / MAX_BENCHMARK_TRAVEL_PER_JOB))
    : 1.0;

  // 3. Unassigned Priority Jobs Score (Weight: 15%)
  // Measures fraction of CRITICAL and HIGH priority jobs that were successfully dispatched
  const totalCritical = allJobs.filter((j) => j.priority === 'CRITICAL').length;
  const totalHigh = allJobs.filter((j) => j.priority === 'HIGH').length;
  const unassignedCritical = Math.max(0, totalCritical - criticalJobsAssigned);
  const unassignedHigh = Math.max(0, totalHigh - highJobsAssigned);
  const priorityPenalty = (unassignedCritical * 0.3) + (unassignedHigh * 0.1);
  const unassignedPriorityScore = Math.max(0.0, 1.0 - Math.min(1.0, priorityPenalty));

  // 4. Workload Balance Score (Weight: 10%)
  // Benchmark: StdDev of 0 minutes = 1.0. StdDev of 120 minutes (2 hrs) = 0.0.
  const MAX_ACCEPTABLE_STD_DEV = 120;
  const workloadBalanceScore = Math.max(
    0.0,
    1.0 - Math.min(1.0, workloadStdDevMinutes / MAX_ACCEPTABLE_STD_DEV)
  );

  // 5. Overtime Score (Weight: 10%)
  // Zero overtime = 1.0. Every 30 minutes overtime drops score by 0.1.
  const overtimeScore = Math.max(0.0, 1.0 - Math.min(1.0, overtimeMinutes / 300));

  // 6. Schedule Stability Score (Weight: 5%)
  // 1.0 if 0 churn. Drops smoothly as assignment changes increase.
  const baselineCount = baselineAssignments ? Math.max(1, baselineAssignments.length) : Math.max(1, assignedJobs);
  const churnRatio = assignmentChangesCount / baselineCount;
  const stabilityScore = Math.max(0.0, 1.0 - Math.min(1.0, churnRatio * 0.5));

  // Weighted Combination
  const weightedTotal =
    slaLatenessScore * weights.slaLateness +
    travelEfficiencyScore * weights.travelEfficiency +
    unassignedPriorityScore * weights.unassignedPriority +
    workloadBalanceScore * weights.workloadBalance +
    overtimeScore * weights.overtime +
    stabilityScore * weights.scheduleStability;

  const totalQualityScore = Math.round(weightedTotal * 10000) / 100;

  const scoreBreakdown: ObjectiveScoreBreakdown = {
    slaLatenessScore: Math.round(slaLatenessScore * 100) / 100,
    travelEfficiencyScore: Math.round(travelEfficiencyScore * 100) / 100,
    unassignedPriorityScore: Math.round(unassignedPriorityScore * 100) / 100,
    workloadBalanceScore: Math.round(workloadBalanceScore * 100) / 100,
    overtimeScore: Math.round(overtimeScore * 100) / 100,
    stabilityScore: Math.round(stabilityScore * 100) / 100,
    totalQualityScore,
  };

  return {
    totalJobs,
    assignedJobs,
    unassignedJobs,
    criticalJobsAssigned,
    highJobsAssigned,
    totalTravelDistanceKm: Math.round(totalTravelDistanceKm * 10) / 10,
    totalTravelMinutes: Math.round(totalTravelMinutes),
    averageTravelMinutes,
    slaViolations,
    lateJobs,
    technicianUtilization,
    workloadVariance: Math.round(variance),
    workloadStdDevMinutes,
    overtimeMinutes,
    assignmentChangesCount,
    qualityScore: totalQualityScore,
    scoreBreakdown,
  };
}
