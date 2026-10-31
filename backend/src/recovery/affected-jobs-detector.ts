import { AffectedJobInfo, DisruptionEventType } from './recovery.types';

export interface DisruptionEventContext {
  eventType: DisruptionEventType;
  technicianId?: string | null;
  jobId?: string | null;
  eventPayload?: any;
}

/**
 * Targeted Affected Job Detection for DispatchGrid.
 * 
 * Accurately isolates jobs directly or transitively impacted by an operational disruption,
 * distinguishing protected active jobs (IN_PROGRESS, COMPLETED) from recoverable scheduled jobs.
 * Ensures unrelated jobs on other technician routes remain untouched.
 */
export function identifyAffectedJobs(
  context: DisruptionEventContext,
  activeAssignments: any[],
  allJobs: any[],
  technicians: any[]
): AffectedJobInfo[] {
  const { eventType, technicianId, jobId, eventPayload } = context;
  const affected: AffectedJobInfo[] = [];

  const jobMap = new Map(allJobs.map((j) => [j.id, j]));
  const techMap = new Map(technicians.map((t) => [t.id, t]));

  function toAffectedJobInfo(
    job: any,
    asgn: any | null,
    cause: string
  ): AffectedJobInfo {
    let requiredSkills: string[] = [];
    try {
      requiredSkills = typeof job.requiredSkills === 'string'
        ? JSON.parse(job.requiredSkills)
        : job.requiredSkills || [];
    } catch {
      requiredSkills = [];
    }

    const tech = asgn ? techMap.get(asgn.technicianId) : null;
    const isProtected = asgn
      ? asgn.status === 'COMPLETED' || asgn.status === 'IN_PROGRESS'
      : job.status === 'COMPLETED' || job.status === 'IN_PROGRESS';

    return {
      jobId: job.id,
      customerName: job.customerName,
      priority: job.priority,
      serviceZone: job.serviceZone,
      requiredSkills,
      estimatedDuration: job.estimatedDuration,
      currentTechnicianId: asgn ? asgn.technicianId : null,
      currentTechnicianName: tech ? tech.name : null,
      scheduledStart: asgn ? new Date(asgn.scheduledStart) : null,
      scheduledEnd: asgn ? new Date(asgn.scheduledEnd) : null,
      slaDeadline: new Date(job.slaDeadline),
      status: asgn ? asgn.status : job.status,
      isProtected,
      cause,
    };
  }

  // =========================================================================
  // SCENARIO A: TECHNICIAN BECOMES UNAVAILABLE
  // =========================================================================
  if (eventType === 'TECHNICIAN_UNAVAILABLE') {
    const techAsgns = activeAssignments
      .filter((a) => a.technicianId === technicianId && a.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());

    for (const asgn of techAsgns) {
      const job = jobMap.get(asgn.jobId);
      if (!job) continue;

      if (asgn.status === 'COMPLETED') {
        affected.push(
          toAffectedJobInfo(
            job,
            asgn,
            'Technician is unavailable, but job was already completed.'
          )
        );
      } else if (asgn.status === 'IN_PROGRESS') {
        affected.push(
          toAffectedJobInfo(
            job,
            asgn,
            'Technician is unavailable, but job is currently in progress.'
          )
        );
      } else {
        affected.push(
          toAffectedJobInfo(
            job,
            asgn,
            'Technician suddenly became unavailable. Immediate reassignment required.'
          )
        );
      }
    }
  }

  // =========================================================================
  // SCENARIO B: URGENT JOB ARRIVAL
  // =========================================================================
  else if (eventType === 'URGENT_JOB_ARRIVAL') {
    let urgentJob = jobId ? jobMap.get(jobId) : null;

    if (!urgentJob && eventPayload?.job) {
      urgentJob = eventPayload.job;
    }

    if (urgentJob) {
      affected.push(
        toAffectedJobInfo(
          urgentJob,
          null,
          'Critical/High urgency job arrival requires priority schedule insertion.'
        )
      );
    }
  }

  // =========================================================================
  // SCENARIO C: JOB DURATION CHANGES
  // =========================================================================
  else if (eventType === 'JOB_DURATION_CHANGED') {
    const targetAsgn = activeAssignments.find((a) => a.jobId === jobId);
    const targetJob = jobId ? jobMap.get(jobId) : null;

    if (targetAsgn && targetJob) {
      const newDuration = eventPayload?.newDurationMinutes || targetJob.estimatedDuration;
      const durationDelta = newDuration - targetJob.estimatedDuration;

      affected.push(
        toAffectedJobInfo(
          targetJob,
          targetAsgn,
          `Job duration changed from ${targetJob.estimatedDuration}m to ${newDuration}m (${durationDelta > 0 ? '+' : ''}${durationDelta}m).`
        )
      );

      // Downstream assignments for this technician on the same day
      const techAsgns = activeAssignments
        .filter(
          (a) =>
            a.technicianId === targetAsgn.technicianId &&
            a.jobId !== targetAsgn.jobId &&
            new Date(a.scheduledStart).getTime() >= new Date(targetAsgn.scheduledStart).getTime() &&
            a.status !== 'CANCELLED'
        )
        .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());

      for (const downstream of techAsgns) {
        const dJob = jobMap.get(downstream.jobId);
        if (dJob) {
          affected.push(
            toAffectedJobInfo(
              dJob,
              downstream,
              `Subsequent assignment on route delayed by preceding duration change.`
            )
          );
        }
      }
    }
  }

  // =========================================================================
  // SCENARIO D: JOB CANCELLED
  // =========================================================================
  else if (eventType === 'JOB_CANCELLED') {
    const targetAsgn = activeAssignments.find((a) => a.jobId === jobId);
    const targetJob = jobId ? jobMap.get(jobId) : null;

    if (targetAsgn && targetJob) {
      affected.push(
        toAffectedJobInfo(
          targetJob,
          targetAsgn,
          'Service order cancelled by customer or dispatcher.'
        )
      );

      // Subsequent assignments on route can be pulled earlier
      const downstreamAsgns = activeAssignments.filter(
        (a) =>
          a.technicianId === targetAsgn.technicianId &&
          a.jobId !== targetAsgn.jobId &&
          new Date(a.scheduledStart).getTime() > new Date(targetAsgn.scheduledStart).getTime() &&
          a.status !== 'CANCELLED'
      );

      for (const d of downstreamAsgns) {
        const dJob = jobMap.get(d.jobId);
        if (dJob) {
          affected.push(
            toAffectedJobInfo(
              dJob,
              d,
              'Preceding job was cancelled; opportunity to pull appointment earlier.'
            )
          );
        }
      }
    }
  }

  // =========================================================================
  // SCENARIO E: EARLY COMPLETION
  // =========================================================================
  else if (eventType === 'EARLY_COMPLETION') {
    const targetAsgn = activeAssignments.find((a) => a.jobId === jobId);
    const targetJob = jobId ? jobMap.get(jobId) : null;

    if (targetAsgn && targetJob) {
      affected.push(
        toAffectedJobInfo(
          targetJob,
          targetAsgn,
          'Technician completed work order ahead of schedule.'
        )
      );

      // Subsequent assignments can be streamlined
      const downstreamAsgns = activeAssignments.filter(
        (a) =>
          a.technicianId === targetAsgn.technicianId &&
          a.jobId !== targetAsgn.jobId &&
          new Date(a.scheduledStart).getTime() > new Date(targetAsgn.scheduledStart).getTime() &&
          a.status !== 'CANCELLED'
      );

      for (const d of downstreamAsgns) {
        const dJob = jobMap.get(d.jobId);
        if (dJob) {
          affected.push(
            toAffectedJobInfo(
              dJob,
              d,
              'Technician completed preceding task early; appointment can be pulled forward.'
            )
          );
        }
      }
    }
  }

  // =========================================================================
  // SCENARIO F: DELAYED COMPLETION
  // =========================================================================
  else if (eventType === 'DELAYED_COMPLETION') {
    const targetAsgn = activeAssignments.find((a) => a.jobId === jobId);
    const targetJob = jobId ? jobMap.get(jobId) : null;

    if (targetAsgn && targetJob) {
      affected.push(
        toAffectedJobInfo(
          targetJob,
          targetAsgn,
          'Technician experienced on-site delays; completed after planned window.'
        )
      );

      const downstreamAsgns = activeAssignments.filter(
        (a) =>
          a.technicianId === targetAsgn.technicianId &&
          a.jobId !== targetAsgn.jobId &&
          new Date(a.scheduledStart).getTime() > new Date(targetAsgn.scheduledStart).getTime() &&
          a.status !== 'CANCELLED'
      );

      for (const d of downstreamAsgns) {
        const dJob = jobMap.get(d.jobId);
        if (dJob) {
          affected.push(
            toAffectedJobInfo(
              dJob,
              d,
              'Preceding on-site delay risks pushing this assignment past customer window or SLA.'
            )
          );
        }
      }
    }
  }

  return affected;
}
