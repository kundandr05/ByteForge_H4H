import {
  JobSchedulingDecision,
  SchedulingEngineMetrics,
  InMemTechnicianSchedule,
} from './scheduling.types';

export function calculateSchedulingMetrics(
  decisions: JobSchedulingDecision[],
  schedules: Map<string, InMemTechnicianSchedule>,
  durationMs: number
): SchedulingEngineMetrics {
  const totalJobs = decisions.length;
  const assignedDecisions = decisions.filter((d) => d.isAssigned);
  const assignedJobs = assignedDecisions.length;
  const unassignedJobs = totalJobs - assignedJobs;
  const successRate = totalJobs > 0 ? Math.round((assignedJobs / totalJobs) * 10000) / 100 : 0;

  let totalTravelTimeMinutes = 0;
  let slaViolations = 0;
  let criticalJobsAssigned = 0;
  let highJobsAssigned = 0;
  let mediumJobsAssigned = 0;
  let lowJobsAssigned = 0;

  for (const d of assignedDecisions) {
    if (d.selectedSlot) {
      totalTravelTimeMinutes += d.selectedSlot.travelTimeMinutes;
    }
    if (d.priority === 'CRITICAL') criticalJobsAssigned++;
    else if (d.priority === 'HIGH') highJobsAssigned++;
    else if (d.priority === 'MEDIUM') mediumJobsAssigned++;
    else if (d.priority === 'LOW') lowJobsAssigned++;
  }

  const averageTravelTimeMinutes = assignedJobs > 0
    ? Math.round((totalTravelTimeMinutes / assignedJobs) * 10) / 10
    : 0;

  // Calculate technician utilization
  let totalShiftCapacityMinutes = 0;
  let totalAllocatedMinutes = 0;
  let activeTechniciansCount = 0;

  for (const [, sched] of schedules) {
    totalShiftCapacityMinutes += sched.totalShiftMinutes;
    totalAllocatedMinutes += sched.allocatedMinutes;
    const assignmentCount = sched.commitments.filter((c) => c.type === 'ASSIGNMENT').length;
    if (assignmentCount > 0) {
      activeTechniciansCount++;
    }
  }

  const technicianUtilization = totalShiftCapacityMinutes > 0
    ? Math.round((totalAllocatedMinutes / totalShiftCapacityMinutes) * 10000) / 100
    : 0;

  return {
    totalJobs,
    assignedJobs,
    unassignedJobs,
    successRate,
    totalTravelTimeMinutes,
    averageTravelTimeMinutes,
    slaViolations,
    criticalJobsAssigned,
    highJobsAssigned,
    mediumJobsAssigned,
    lowJobsAssigned,
    technicianUtilization,
    activeTechniciansCount,
    totalShiftCapacityMinutes,
    totalAllocatedMinutes,
    executionDurationMs: durationMs,
  };
}
