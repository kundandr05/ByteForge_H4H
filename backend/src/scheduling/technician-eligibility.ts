import { parseShiftTime } from '../utils/dateTime';

export interface EligibilityResult {
  eligibleTechnicians: any[];
  rejectedTechnicians: Array<{
    technicianId: string;
    technicianName: string;
    reason: string;
  }>;
}

/**
 * Evaluates candidate technicians against static hard constraints:
 * 1. Skill Compatibility (Must possess every required skill)
 * 2. Service Zone Eligibility (Must be authorized to operate in the job's zone)
 * 3. Base Availability Status (Rejects OFF_DUTY or UNAVAILABLE)
 * 4. Shift Duration Capacity (Daily shift duration must be >= job estimated duration)
 */
export function findEligibleTechnicians(job: any, technicians: any[]): EligibilityResult {
  const eligibleTechnicians: any[] = [];
  const rejectedTechnicians: Array<{
    technicianId: string;
    technicianName: string;
    reason: string;
  }> = [];

  let requiredSkills: string[] = [];
  try {
    requiredSkills = typeof job.requiredSkills === 'string'
      ? JSON.parse(job.requiredSkills)
      : job.requiredSkills || [];
  } catch {
    requiredSkills = [];
  }

  for (const tech of technicians) {
    let techSkills: string[] = [];
    let techZones: string[] = [];

    try {
      techSkills = typeof tech.skills === 'string' ? JSON.parse(tech.skills) : tech.skills || [];
    } catch {
      techSkills = [];
    }

    try {
      techZones = typeof tech.serviceZones === 'string' ? JSON.parse(tech.serviceZones) : tech.serviceZones || [];
    } catch {
      techZones = [];
    }

    // 1. Skill Compatibility
    const missingSkills = requiredSkills.filter((s) => !techSkills.includes(s));
    if (missingSkills.length > 0) {
      rejectedTechnicians.push({
        technicianId: tech.id,
        technicianName: tech.name,
        reason: `Missing required skill(s): [${missingSkills.join(', ')}]`,
      });
      continue;
    }

    // 2. Service Zone Compatibility
    if (!techZones.includes(job.serviceZone)) {
      rejectedTechnicians.push({
        technicianId: tech.id,
        technicianName: tech.name,
        reason: `Technician does not service zone '${job.serviceZone}' (covers: [${techZones.join(', ')}])`,
      });
      continue;
    }

    // 3. Availability Status
    if (tech.availabilityStatus === 'OFF_DUTY' || tech.availabilityStatus === 'UNAVAILABLE') {
      rejectedTechnicians.push({
        technicianId: tech.id,
        technicianName: tech.name,
        reason: `Technician is currently marked as ${tech.availabilityStatus}`,
      });
      continue;
    }

    // 4. Shift Capacity
    try {
      const start = parseShiftTime(tech.shiftStart);
      const end = parseShiftTime(tech.shiftEnd);
      let shiftMinutes = (end.hours * 60 + end.minutes) - (start.hours * 60 + start.minutes);
      if (shiftMinutes <= 0) {
        shiftMinutes += 24 * 60; // Overnight
      }

      if (shiftMinutes < job.estimatedDuration) {
        rejectedTechnicians.push({
          technicianId: tech.id,
          technicianName: tech.name,
          reason: `Job duration (${job.estimatedDuration}m) exceeds full shift duration (${shiftMinutes}m)`,
        });
        continue;
      }
    } catch {
      // Invalid shift time format
      rejectedTechnicians.push({
        technicianId: tech.id,
        technicianName: tech.name,
        reason: 'Invalid technician shift configuration',
      });
      continue;
    }

    eligibleTechnicians.push(tech);
  }

  return { eligibleTechnicians, rejectedTechnicians };
}
