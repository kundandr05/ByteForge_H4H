import { Coordinates, CandidateSlot, InMemTechnicianSchedule } from './scheduling.types';
import { calculateTravelEstimate, validateCoordinates } from './travel-calculator';

export interface ConstraintValidationResult {
  isValid: boolean;
  violatedConstraint?: string;
  reason?: string;
}

/**
 * Validates whether a proposed assignment satisfies all 12 hard operational constraints.
 * Hard constraints MUST NEVER be violated.
 */
export function validateHardConstraints(
  job: any,
  technician: any,
  slot: CandidateSlot,
  schedule: InMemTechnicianSchedule
): ConstraintValidationResult {
  const startMs = slot.scheduledStart.getTime();
  const endMs = slot.scheduledEnd.getTime();
  const durationMs = job.estimatedDuration * 60 * 1000;

  // CONSTRAINT 10: Valid Coordinates
  if (!validateCoordinates(job.latitude, job.longitude)) {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_10_VALID_COORDINATES',
      reason: `Job coordinates (${job.latitude}, ${job.longitude}) are invalid.`,
    };
  }

  // CONSTRAINT 11: Positive Duration Integrity
  if (job.estimatedDuration <= 0) {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_11_POSITIVE_DURATION',
      reason: `Job duration must be strictly positive (> 0 minutes). Got: ${job.estimatedDuration}`,
    };
  }

  if (endMs - startMs !== durationMs) {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_11_POSITIVE_DURATION',
      reason: `Scheduled duration (${(endMs - startMs) / 60000}m) does not match estimated job duration (${job.estimatedDuration}m).`,
    };
  }

  // CONSTRAINT 1: Skill Compatibility
  let requiredSkills: string[] = [];
  try {
    requiredSkills = typeof job.requiredSkills === 'string'
      ? JSON.parse(job.requiredSkills)
      : job.requiredSkills || [];
  } catch {
    requiredSkills = [];
  }

  let techSkills: string[] = [];
  try {
    techSkills = typeof technician.skills === 'string'
      ? JSON.parse(technician.skills)
      : technician.skills || [];
  } catch {
    techSkills = [];
  }

  const missingSkills = requiredSkills.filter((s) => !techSkills.includes(s));
  if (missingSkills.length > 0) {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_1_SKILL_COMPATIBILITY',
      reason: `Technician lacks required skill(s): [${missingSkills.join(', ')}].`,
    };
  }

  // CONSTRAINT 2: Service Zone Eligibility
  let techZones: string[] = [];
  try {
    techZones = typeof technician.serviceZones === 'string'
      ? JSON.parse(technician.serviceZones)
      : technician.serviceZones || [];
  } catch {
    techZones = [];
  }

  if (!techZones.includes(job.serviceZone)) {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_2_SERVICE_ZONE',
      reason: `Technician is not authorized for service zone: ${job.serviceZone}.`,
    };
  }

  // CONSTRAINT 3: Technician Base Availability Status
  if (technician.availabilityStatus === 'OFF_DUTY' || technician.availabilityStatus === 'UNAVAILABLE') {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_3_TECHNICIAN_AVAILABILITY',
      reason: `Technician status is currently ${technician.availabilityStatus}.`,
    };
  }

  // CONSTRAINT 4: Shift Boundaries
  if (startMs < schedule.shiftStartUtc.getTime() || endMs > schedule.shiftEndUtc.getTime()) {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_4_SHIFT_BOUNDARIES',
      reason: `Appointment [${slot.scheduledStart.toISOString()} - ${slot.scheduledEnd.toISOString()}] falls outside shift hours [${schedule.shiftStartUtc.toISOString()} - ${schedule.shiftEndUtc.toISOString()}].`,
    };
  }

  // CONSTRAINT 5: Job Time Window
  const earliestStartMs = new Date(job.earliestStart).getTime();
  const latestEndMs = new Date(job.latestEnd).getTime();
  if (startMs < earliestStartMs || endMs > latestEndMs) {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_5_JOB_TIME_WINDOW',
      reason: `Appointment violates job window [${new Date(job.earliestStart).toISOString()} - ${new Date(job.latestEnd).toISOString()}].`,
    };
  }

  // CONSTRAINT 6: SLA Deadline
  const slaDeadlineMs = new Date(job.slaDeadline).getTime();
  if (endMs > slaDeadlineMs) {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_6_SLA_DEADLINE',
      reason: `Appointment completion (${slot.scheduledEnd.toISOString()}) violates SLA deadline (${new Date(job.slaDeadline).toISOString()}).`,
    };
  }

  // CONSTRAINT 8: No Overlapping Assignments for Technician
  for (const commitment of schedule.commitments) {
    if (commitment.type === 'ASSIGNMENT') {
      const commitStartMs = commitment.startTime.getTime();
      const commitEndMs = commitment.endTime.getTime();
      // Overlap condition: start < commitEnd && end > commitStart
      if (startMs < commitEndMs && endMs > commitStartMs) {
        return {
          isValid: false,
          violatedConstraint: 'CONSTRAINT_8_NO_OVERLAPPING_ASSIGNMENTS',
          reason: `Appointment overlaps with existing technician assignment (${commitment.startTime.toISOString()} - ${commitment.endTime.toISOString()}).`,
        };
      }
    }
  }

  // CONSTRAINT 9: No Overlap with Unavailability Periods
  for (const commitment of schedule.commitments) {
    if (commitment.type === 'UNAVAILABILITY') {
      const commitStartMs = commitment.startTime.getTime();
      const commitEndMs = commitment.endTime.getTime();
      if (startMs < commitEndMs && endMs > commitStartMs) {
        return {
          isValid: false,
          violatedConstraint: 'CONSTRAINT_9_NO_UNAVAILABILITY_OVERLAP',
          reason: `Appointment overlaps with technician unavailability (${commitment.startTime.toISOString()} - ${commitment.endTime.toISOString()}).`,
        };
      }
    }
  }

  // CONSTRAINT 7: Travel Time Feasibility
  // Sort commitments chronologically to verify transit gap
  const sorted = [...schedule.commitments].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  
  // Previous commitment or shift start
  let prevCommitment = null;
  let nextCommitment = null;

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].endTime.getTime() <= startMs) {
      prevCommitment = sorted[i];
    }
    if (sorted[i].startTime.getTime() >= endMs && !nextCommitment) {
      nextCommitment = sorted[i];
    }
  }

  const prevLoc = prevCommitment?.location || schedule.homeLocation;
  const transitTo = calculateTravelEstimate(prevLoc, { latitude: job.latitude, longitude: job.longitude });
  const departureMs = prevCommitment ? prevCommitment.endTime.getTime() : schedule.shiftStartUtc.getTime();

  if (departureMs + transitTo.travelTimeMinutes * 60 * 1000 > startMs) {
    return {
      isValid: false,
      violatedConstraint: 'CONSTRAINT_7_TRAVEL_FEASIBILITY',
      reason: `Insufficient travel time to arrive at job location (requires ${transitTo.travelTimeMinutes} mins travel).`,
    };
  }

  if (nextCommitment && nextCommitment.location) {
    const transitFrom = calculateTravelEstimate(
      { latitude: job.latitude, longitude: job.longitude },
      nextCommitment.location
    );
    if (endMs + transitFrom.travelTimeMinutes * 60 * 1000 > nextCommitment.startTime.getTime()) {
      return {
        isValid: false,
        violatedConstraint: 'CONSTRAINT_7_TRAVEL_FEASIBILITY',
        reason: `Insufficient travel time to reach next commitment after job completion (requires ${transitFrom.travelTimeMinutes} mins travel).`,
      };
    }
  }

  return { isValid: true };
}
