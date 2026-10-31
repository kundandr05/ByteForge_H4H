import {
  CandidateSlot,
  ScoreBreakdown,
  UnassignedClassification,
  UnassignedReasonCode,
} from './scheduling.types';

export interface ExplanationResult {
  explanation: string;
  classification?: UnassignedClassification;
  unassignedReasonCode?: UnassignedReasonCode;
  suggestedAction?: string;
}

export function generateAssignmentExplanation(
  job: any,
  technician: any,
  slot: CandidateSlot,
  scoreBreakdown: ScoreBreakdown
): string {
  const startStr = slot.scheduledStart.toISOString().substring(11, 16);
  const endStr = slot.scheduledEnd.toISOString().substring(11, 16);
  return (
    `Assigned to ${technician.name} for window ${startStr}-${endStr} UTC. ` +
    `Optimization score: ${scoreBreakdown.totalScore}/100 ` +
    `(Travel: ${slot.travelTimeMinutes}m, SLA buffer: ${scoreBreakdown.slaUrgencyScore * 100}%, ` +
    `Workload balance factor: ${scoreBreakdown.workloadBalanceScore * 100}%).`
  );
}

export function generateUnassignedExplanation(
  job: any,
  allTechnicians: any[],
  rejections: Array<{ technicianId: string; technicianName: string; reason: string }>
): ExplanationResult {
  const earliest = new Date(job.earliestStart).getTime();
  const latest = new Date(job.latestEnd).getTime();
  const sla = new Date(job.slaDeadline).getTime();
  const durationMs = job.estimatedDuration * 60 * 1000;

  // 1. Check if impossible deadline or negative window
  if (earliest + durationMs > sla || earliest + durationMs > latest) {
    return {
      explanation: `Job cannot be scheduled: estimated duration of ${job.estimatedDuration} minutes exceeds the allowable window before SLA deadline or latest end.`,
      classification: 'UNASSIGNABLE',
      unassignedReasonCode: 'SLA_DEADLINE_CONFLICT',
      suggestedAction: 'Negotiate revised SLA deadline or extended service window with customer.',
    };
  }

  // 2. Check skill mismatch across all technicians
  let requiredSkills: string[] = [];
  try {
    requiredSkills = typeof job.requiredSkills === 'string'
      ? JSON.parse(job.requiredSkills)
      : job.requiredSkills || [];
  } catch {
    requiredSkills = [];
  }

  const anyTechHasSkills = allTechnicians.some((tech) => {
    let techSkills: string[] = [];
    try {
      techSkills = typeof tech.skills === 'string' ? JSON.parse(tech.skills) : tech.skills || [];
    } catch {
      techSkills = [];
    }
    return requiredSkills.every((s) => techSkills.includes(s));
  });

  if (!anyTechHasSkills) {
    return {
      explanation: `No technician in the workforce possesses the full set of required skills: [${requiredSkills.join(', ')}].`,
      classification: 'UNASSIGNABLE',
      unassignedReasonCode: 'NO_TECHNICIAN_WITH_REQUIRED_SKILLS',
      suggestedAction: 'Cross-train available technicians or recruit specialized contractors with required credentials.',
    };
  }

  // 3. Check service zone eligibility
  const anyTechInZone = allTechnicians.some((tech) => {
    let techZones: string[] = [];
    try {
      techZones = typeof tech.serviceZones === 'string' ? JSON.parse(tech.serviceZones) : tech.serviceZones || [];
    } catch {
      techZones = [];
    }
    return techZones.includes(job.serviceZone);
  });

  if (!anyTechInZone) {
    return {
      explanation: `No technician is currently authorized or assigned to operate in service zone ${job.serviceZone}.`,
      classification: 'UNASSIGNABLE',
      unassignedReasonCode: 'NO_TECHNICIAN_IN_SERVICE_ZONE',
      suggestedAction: 'Expand technician zone coverage boundaries or rezone active dispatch clusters.',
    };
  }

  // 4. Check if rejections are due to capacity or shift boundaries
  const hasShiftConflict = rejections.some((r) => r.reason.toLowerCase().includes('shift'));
  const hasTravelConflict = rejections.some((r) => r.reason.toLowerCase().includes('travel'));
  const hasUnavailability = rejections.some((r) => r.reason.toLowerCase().includes('unavailability'));

  if (hasUnavailability) {
    return {
      explanation: `Technicians eligible for this job are currently on leave or scheduled unavailability during the appointment window.`,
      classification: 'TEMPORARILY_INFEASIBLE',
      unassignedReasonCode: 'TECHNICIAN_UNAVAILABLE',
      suggestedAction: 'Reschedule job window after technician unavailability ends or assign secondary coverage.',
    };
  }

  if (hasTravelConflict || hasShiftConflict) {
    return {
      explanation: `Eligible technicians have full shifts or lack sufficient transit buffer between commitments to reach this job.`,
      classification: 'TEMPORARILY_INFEASIBLE',
      unassignedReasonCode: 'INSUFFICIENT_TECHNICIAN_CAPACITY',
      suggestedAction: 'Extend technician shift hours or dispatch to next available business shift.',
    };
  }

  return {
    explanation: `No feasible appointment slot found within constraints (all eligible technicians are fully booked).`,
    classification: 'TEMPORARILY_INFEASIBLE',
    unassignedReasonCode: 'NO_FEASIBLE_TIME_SLOT',
    suggestedAction: 'Add technician shift capacity or defer lower priority tasks.',
  };
}
