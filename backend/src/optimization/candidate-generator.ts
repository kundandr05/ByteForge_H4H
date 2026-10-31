import { calculateTravelEstimate } from '../scheduling/travel-calculator';
import { getShiftWindowForDate } from '../scheduling/scheduling.engine';
import { EvaluatedAssignment } from './optimization.objective';
import { OptimizationOperationType } from './optimization.types';

export interface ProposedCandidateMove {
  operationType: OptimizationOperationType;
  description: string;
  newAssignments: EvaluatedAssignment[];
  affectedJobId: string;
  affectedJob: any;
  prevTech: any | null;
  newTech: any;
  prevStart: Date | null;
  prevEnd: Date | null;
  newStart: Date;
  newEnd: Date;
  travelImpactMinutes: number;
  workloadImpactMinutes: number;
  slaImpactMinutes: number;
}

/**
 * Re-evaluates a chronological sequence of jobs for a single technician,
 * checking shift boundaries, travel buffers, time windows, and SLA limits.
 * Returns null if the sequence violates any hard constraint.
 */
export function evaluateJobSequenceForTechnician(
  tech: any,
  jobsInOrder: any[],
  refDate: Date,
  unavailabilities: any[] = []
): EvaluatedAssignment[] | null {
  const { shiftStartUtc, shiftEndUtc } = getShiftWindowForDate(
    tech.shiftStart,
    tech.shiftEnd,
    refDate
  );

  const homeLoc = { latitude: tech.latitude, longitude: tech.longitude };
  let currentLoc = homeLoc;
  let currentMs = shiftStartUtc.getTime();

  const results: EvaluatedAssignment[] = [];

  for (const job of jobsInOrder) {
    const jobLoc = { latitude: job.latitude, longitude: job.longitude };
    const travel = calculateTravelEstimate(currentLoc, jobLoc);
    const arrivalMs = currentMs + travel.travelTimeMinutes * 60 * 1000;

    const earliestStartMs = new Date(job.earliestStart).getTime();
    const latestEndMs = new Date(job.latestEnd).getTime();
    const slaDeadlineMs = new Date(job.slaDeadline).getTime();
    const durationMs = job.estimatedDuration * 60 * 1000;

    const startMs = Math.max(arrivalMs, earliestStartMs);
    const endMs = startMs + durationMs;

    // Hard Constraint Checks
    if (endMs > shiftEndUtc.getTime()) return null; // Outside shift
    if (endMs > latestEndMs) return null;          // Outside job window
    if (endMs > slaDeadlineMs) return null;        // Violates SLA deadline

    // Unavailability overlaps
    for (const u of unavailabilities) {
      const uStart = new Date(u.startTime).getTime();
      const uEnd = new Date(u.endTime).getTime();
      if (startMs < uEnd && endMs > uStart) return null;
    }

    results.push({
      jobId: job.id,
      technicianId: tech.id,
      scheduledStart: new Date(startMs),
      scheduledEnd: new Date(endMs),
      travelTimeMinutes: travel.travelTimeMinutes,
      travelDistanceKm: travel.distanceKm,
      job,
      status: 'SCHEDULED',
    });

    currentLoc = jobLoc;
    currentMs = endMs;
  }

  return results;
}

/**
 * Generates candidate optimization moves for a schedule.
 * Prioritizes:
 * 1. Intra-route reordering (reducing travel time)
 * 2. Time-slot compaction (shifting earlier to increase SLA buffer)
 * 3. Technician reassignment (balancing workload)
 * 4. Job swapping between technicians
 * 5. Inserting unassigned high-priority jobs
 */
export function generateCandidateMoves(
  currentAssignments: EvaluatedAssignment[],
  allJobs: any[],
  technicians: any[],
  refDate: Date
): ProposedCandidateMove[] {
  const candidateMoves: ProposedCandidateMove[] = [];

  // Group current assignments by technician
  const techAssignments = new Map<string, EvaluatedAssignment[]>();
  for (const t of technicians) {
    techAssignments.set(t.id, []);
  }
  for (const asgn of currentAssignments) {
    const list = techAssignments.get(asgn.technicianId);
    if (list) list.push(asgn);
  }

  // 1. Intra-Route Reordering (2-opt swap for a technician's jobs)
  for (const tech of technicians) {
    const assignments = techAssignments.get(tech.id) || [];
    if (assignments.length < 2) continue;

    // Sort chronologically
    assignments.sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());

    for (let i = 0; i < assignments.length - 1; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        // Protect COMPLETED and IN_PROGRESS jobs
        if (assignments[i].status === 'COMPLETED' || assignments[i].status === 'IN_PROGRESS') continue;
        if (assignments[j].status === 'COMPLETED' || assignments[j].status === 'IN_PROGRESS') continue;

        // Try swapping the sequence of i and j
        const permutedJobs = assignments.map((a) => a.job);
        const temp = permutedJobs[i];
        permutedJobs[i] = permutedJobs[j];
        permutedJobs[j] = temp;

        const unavails = tech.unavailabilities || [];
        const evaluatedSeq = evaluateJobSequenceForTechnician(tech, permutedJobs, refDate, unavails);

        if (evaluatedSeq) {
          const oldTravel = assignments[i].travelTimeMinutes + assignments[j].travelTimeMinutes;
          const newTravel = evaluatedSeq[i].travelTimeMinutes + evaluatedSeq[j].travelTimeMinutes;
          const travelImpact = newTravel - oldTravel;

          // If travel time is reduced or unchanged with earlier finish
          if (travelImpact <= 0) {
            // Build new assignments array
            const otherTechAssignments = currentAssignments.filter((a) => a.technicianId !== tech.id);
            const newAll = [...otherTechAssignments, ...evaluatedSeq];

            candidateMoves.push({
              operationType: 'REORDER_ROUTE',
              description: `Reorder route stops ${i + 1} and ${j + 1} for ${tech.name}`,
              newAssignments: newAll,
              affectedJobId: assignments[i].jobId,
              affectedJob: assignments[i].job,
              prevTech: tech,
              newTech: tech,
              prevStart: assignments[i].scheduledStart,
              prevEnd: assignments[i].scheduledEnd,
              newStart: evaluatedSeq[j].scheduledStart,
              newEnd: evaluatedSeq[j].scheduledEnd,
              travelImpactMinutes: travelImpact,
              workloadImpactMinutes: 0,
              slaImpactMinutes: Math.round(
                (new Date(assignments[i].job.slaDeadline).getTime() - evaluatedSeq[j].scheduledEnd.getTime()) / 60000
              ),
            });
          }
        }
      }
    }
  }

  // 2. Technician Reassignment (Workload balancing & travel reduction)
  // Find overloaded technicians and try reassigning an assignment to an underloaded technician
  const techWorkloads = technicians.map((t) => {
    const asgns = techAssignments.get(t.id) || [];
    const loadMins = asgns.reduce((sum, a) => sum + (a.job?.estimatedDuration || 0), 0);
    return { tech: t, loadMins, assignments: asgns };
  });

  techWorkloads.sort((a, b) => b.loadMins - a.loadMins); // Most loaded first

  for (let top = 0; top < Math.min(5, techWorkloads.length); top++) {
    const source = techWorkloads[top];
    if (source.assignments.length === 0) continue;

    for (const asgn of source.assignments) {
      if (asgn.status === 'COMPLETED' || asgn.status === 'IN_PROGRESS') continue;

      let requiredSkills: string[] = [];
      try {
        requiredSkills = typeof asgn.job.requiredSkills === 'string'
          ? JSON.parse(asgn.job.requiredSkills)
          : asgn.job.requiredSkills || [];
      } catch {
        requiredSkills = [];
      }

      // Try lower-loaded target technicians
      for (let bottom = techWorkloads.length - 1; bottom > top; bottom--) {
        const target = techWorkloads[bottom];
        if (target.tech.availabilityStatus === 'OFF_DUTY' || target.tech.availabilityStatus === 'UNAVAILABLE') {
          continue;
        }

        let targetSkills: string[] = [];
        try {
          targetSkills = typeof target.tech.skills === 'string'
            ? JSON.parse(target.tech.skills)
            : target.tech.skills || [];
        } catch {
          targetSkills = [];
        }

        let targetZones: string[] = [];
        try {
          targetZones = typeof target.tech.serviceZones === 'string'
            ? JSON.parse(target.tech.serviceZones)
            : target.tech.serviceZones || [];
        } catch {
          targetZones = [];
        }

        // Skill & zone compatibility
        if (!requiredSkills.every((s) => targetSkills.includes(s))) continue;
        if (!targetZones.includes(asgn.job.serviceZone)) continue;

        // Try inserting asgn.job into target's sequence at various positions
        const targetJobs = target.assignments.map((a) => a.job);
        for (let pos = 0; pos <= targetJobs.length; pos++) {
          const newTargetJobs = [...targetJobs.slice(0, pos), asgn.job, ...targetJobs.slice(pos)];
          const newTargetSeq = evaluateJobSequenceForTechnician(
            target.tech,
            newTargetJobs,
            refDate,
            target.tech.unavailabilities || []
          );

          if (newTargetSeq) {
            // Remove asgn from source and re-evaluate source
            const newSourceJobs = source.assignments.filter((a) => a.jobId !== asgn.jobId).map((a) => a.job);
            const newSourceSeq = evaluateJobSequenceForTechnician(
              source.tech,
              newSourceJobs,
              refDate,
              source.tech.unavailabilities || []
            );

            if (newSourceSeq) {
              const otherTechAssignments = currentAssignments.filter(
                (a) => a.technicianId !== source.tech.id && a.technicianId !== target.tech.id
              );
              const newAll = [...otherTechAssignments, ...newSourceSeq, ...newTargetSeq];

              const targetAsgn = newTargetSeq.find((a) => a.jobId === asgn.jobId)!;
              const travelImpact = targetAsgn.travelTimeMinutes - asgn.travelTimeMinutes;
              const workloadImpact = asgn.job.estimatedDuration;

              candidateMoves.push({
                operationType: 'REASSIGN_TECHNICIAN',
                description: `Reassign ${asgn.job.customerName} from ${source.tech.name} to ${target.tech.name}`,
                newAssignments: newAll,
                affectedJobId: asgn.jobId,
                affectedJob: asgn.job,
                prevTech: source.tech,
                newTech: target.tech,
                prevStart: asgn.scheduledStart,
                prevEnd: asgn.scheduledEnd,
                newStart: targetAsgn.scheduledStart,
                newEnd: targetAsgn.scheduledEnd,
                travelImpactMinutes: travelImpact,
                workloadImpactMinutes: workloadImpact,
                slaImpactMinutes: Math.round(
                  (new Date(asgn.job.slaDeadline).getTime() - targetAsgn.scheduledEnd.getTime()) / 60000
                ),
              });
              break; // Found feasible insertion position for this target
            }
          }
        }
      }
    }
  }

  // 3. Try Assigning Unassigned High/Critical Priority Jobs
  const assignedJobIds = new Set(currentAssignments.map((a) => a.jobId));
  const unassignedPriorityJobs = allJobs
    .filter((j) => !assignedJobIds.has(j.id) && (j.priority === 'CRITICAL' || j.priority === 'HIGH'))
    .slice(0, 10);

  for (const job of unassignedPriorityJobs) {
    let requiredSkills: string[] = [];
    try {
      requiredSkills = typeof job.requiredSkills === 'string'
        ? JSON.parse(job.requiredSkills)
        : job.requiredSkills || [];
    } catch {
      requiredSkills = [];
    }

    for (const tech of technicians) {
      if (tech.availabilityStatus === 'OFF_DUTY' || tech.availabilityStatus === 'UNAVAILABLE') continue;

      let techSkills: string[] = [];
      try {
        techSkills = typeof tech.skills === 'string' ? JSON.parse(tech.skills) : tech.skills || [];
      } catch {
        techSkills = [];
      }

      let techZones: string[] = [];
      try {
        techZones = typeof tech.serviceZones === 'string' ? JSON.parse(tech.serviceZones) : tech.serviceZones || [];
      } catch {
        techZones = [];
      }

      if (!requiredSkills.every((s) => techSkills.includes(s))) continue;
      if (!techZones.includes(job.serviceZone)) continue;

      const currentTechJobs = (techAssignments.get(tech.id) || []).map((a) => a.job);
      for (let pos = 0; pos <= currentTechJobs.length; pos++) {
        const candidateSeq = [...currentTechJobs.slice(0, pos), job, ...currentTechJobs.slice(pos)];
        const evaluatedSeq = evaluateJobSequenceForTechnician(
          tech,
          candidateSeq,
          refDate,
          tech.unavailabilities || []
        );

        if (evaluatedSeq) {
          const otherTechAssignments = currentAssignments.filter((a) => a.technicianId !== tech.id);
          const newAll = [...otherTechAssignments, ...evaluatedSeq];
          const newAsgn = evaluatedSeq.find((a) => a.jobId === job.id)!;

          candidateMoves.push({
            operationType: 'ASSIGN_UNASSIGNED',
            description: `Assign previously unassigned ${job.priority} job (${job.customerName}) to ${tech.name}`,
            newAssignments: newAll,
            affectedJobId: job.id,
            affectedJob: job,
            prevTech: null,
            newTech: tech,
            prevStart: null,
            prevEnd: null,
            newStart: newAsgn.scheduledStart,
            newEnd: newAsgn.scheduledEnd,
            travelImpactMinutes: newAsgn.travelTimeMinutes,
            workloadImpactMinutes: job.estimatedDuration,
            slaImpactMinutes: Math.round(
              (new Date(job.slaDeadline).getTime() - newAsgn.scheduledEnd.getTime()) / 60000
            ),
          });
          break;
        }
      }
    }
  }

  return candidateMoves;
}
