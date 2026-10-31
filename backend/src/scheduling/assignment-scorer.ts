import { CandidateSlot, ScoreBreakdown, ScoringWeights, DEFAULT_SCORING_WEIGHTS, InMemTechnicianSchedule } from './scheduling.types';

const MAX_TRAVEL_TIME_MINUTES = 120; // 2 hours benchmark for travel normalization
const MAX_IDLE_GAP_MINUTES = 180; // 3 hours benchmark for idle gap

/**
 * Calculates a normalized multi-criteria objective score (0.0 to 100.0) for a candidate assignment slot.
 */
export function scoreCandidateSlot(
  job: any,
  technician: any,
  slot: CandidateSlot,
  schedule: InMemTechnicianSchedule,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): { totalScore: number; breakdown: ScoreBreakdown } {
  // 1. SLA Urgency Score (0.0 to 1.0)
  // Rewards finishing earlier before the SLA deadline expires
  const scheduledEndMs = slot.scheduledEnd.getTime();
  const slaDeadlineMs = new Date(job.slaDeadline).getTime();
  const scheduledStartMs = slot.scheduledStart.getTime();
  const totalWindowMs = Math.max(60 * 1000, slaDeadlineMs - scheduledStartMs);
  const bufferRemainingMs = Math.max(0, slaDeadlineMs - scheduledEndMs);
  const slaUrgencyScore = Math.min(1.0, Math.max(0.0, bufferRemainingMs / totalWindowMs));

  // 2. Travel Efficiency Score (0.0 to 1.0)
  // Shorter transit times score closer to 1.0
  const travelMinutes = slot.travelTimeMinutes;
  const travelEfficiencyScore = Math.max(0.0, 1.0 - Math.min(1.0, travelMinutes / MAX_TRAVEL_TIME_MINUTES));

  // 3. Workload Balance Score (0.0 to 1.0)
  // Favors technicians with lower current utilization to distribute assignments fairly
  const currentUtilization = schedule.totalShiftMinutes > 0
    ? schedule.allocatedMinutes / schedule.totalShiftMinutes
    : 1.0;
  const workloadBalanceScore = Math.max(0.0, 1.0 - Math.min(1.0, currentUtilization));

  // 4. Priority Suitability Score (0.0 to 1.0)
  // High and Critical jobs get prioritized assignment quality
  let priorityWeight = 0.5;
  if (job.priority === 'CRITICAL') priorityWeight = 1.0;
  else if (job.priority === 'HIGH') priorityWeight = 0.8;
  else if (job.priority === 'MEDIUM') priorityWeight = 0.6;
  else if (job.priority === 'LOW') priorityWeight = 0.4;
  const priorityScore = priorityWeight;

  // 5. Schedule Stability / Compactness Score (0.0 to 1.0)
  // Rewards minimizing idle downtime between jobs
  const idleGap = slot.idleGapMinutesBefore;
  const stabilityScore = Math.max(0.0, 1.0 - Math.min(1.0, idleGap / MAX_IDLE_GAP_MINUTES));

  // Weighted total (normalized to 0 - 100)
  const weightedSum =
    slaUrgencyScore * weights.slaUrgency +
    travelEfficiencyScore * weights.travelEfficiency +
    workloadBalanceScore * weights.workloadBalance +
    priorityScore * weights.prioritySuitability +
    stabilityScore * weights.scheduleStability;

  const totalScore = Math.round(weightedSum * 10000) / 100; // e.g. 84.75

  const breakdown: ScoreBreakdown = {
    slaUrgencyScore: Math.round(slaUrgencyScore * 100) / 100,
    travelEfficiencyScore: Math.round(travelEfficiencyScore * 100) / 100,
    workloadBalanceScore: Math.round(workloadBalanceScore * 100) / 100,
    priorityScore: Math.round(priorityScore * 100) / 100,
    stabilityScore: Math.round(stabilityScore * 100) / 100,
    totalScore,
  };

  return { totalScore, breakdown };
}
