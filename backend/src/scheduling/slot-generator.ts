import { calculateTravelEstimate } from './travel-calculator';
import {
  CandidateSlot,
  Coordinates,
  InMemTechnicianSchedule,
} from './scheduling.types';

export function generateFeasibleSlots(
  job: any,
  schedule: InMemTechnicianSchedule
): CandidateSlot[] {
  const feasibleSlots: CandidateSlot[] = [];

  const jobLocation: Coordinates = {
    latitude: job.latitude,
    longitude: job.longitude,
  };

  const jobEarliestStart = new Date(job.earliestStart);
  const jobLatestEnd = new Date(job.latestEnd);
  const jobSlaDeadline = new Date(job.slaDeadline);
  const jobDurationMinutes = job.estimatedDuration;
  const jobDurationMs = jobDurationMinutes * 60 * 1000;

  // Filter and sort existing commitments that intersect this technician's shift window
  const commitments = schedule.commitments
    .filter(
      (c) =>
        c.startTime.getTime() < schedule.shiftEndUtc.getTime() &&
        c.endTime.getTime() > schedule.shiftStartUtc.getTime()
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Build candidate timeline intervals (Gaps) within technician's working shift
  interface ScheduleGap {
    gapIndex: number;
    start: Date;
    end: Date;
    prevLocation: Coordinates;
    nextLocation?: Coordinates;
    nextCommitmentStart?: Date;
  }

  const gaps: ScheduleGap[] = [];

  if (commitments.length === 0) {
    // Entire shift is free
    gaps.push({
      gapIndex: 0,
      start: schedule.shiftStartUtc,
      end: schedule.shiftEndUtc,
      prevLocation: schedule.homeLocation,
    });
  } else {
    // Gap 0: Shift start to first commitment
    const first = commitments[0];
    if (first.startTime.getTime() > schedule.shiftStartUtc.getTime()) {
      gaps.push({
        gapIndex: 0,
        start: schedule.shiftStartUtc,
        end: first.startTime,
        prevLocation: schedule.homeLocation,
        nextLocation: first.location,
        nextCommitmentStart: first.startTime,
      });
    }

    // Gaps between consecutive commitments
    for (let i = 0; i < commitments.length - 1; i++) {
      const current = commitments[i];
      const next = commitments[i + 1];

      if (next.startTime.getTime() > current.endTime.getTime()) {
        gaps.push({
          gapIndex: i + 1,
          start: current.endTime,
          end: next.startTime,
          prevLocation: current.location || schedule.homeLocation,
          nextLocation: next.location,
          nextCommitmentStart: next.startTime,
        });
      }
    }

    // Final gap: Last commitment end to shift end
    const last = commitments[commitments.length - 1];
    if (schedule.shiftEndUtc.getTime() > last.endTime.getTime()) {
      gaps.push({
        gapIndex: commitments.length,
        start: last.endTime,
        end: schedule.shiftEndUtc,
        prevLocation: last.location || schedule.homeLocation,
      });
    }
  }

  // Evaluate candidate slots within each available schedule gap
  for (const gap of gaps) {
    // 1. Calculate transit time from previous location to this job
    const travelTo = calculateTravelEstimate(gap.prevLocation, jobLocation);
    const travelMs = travelTo.travelTimeMinutes * 60 * 1000;

    // Earliest departure is gap.start; arrival at customer location
    const earliestArrivalMs = gap.start.getTime() + travelMs;

    // The job cannot start before its customer-specified earliestStart or before the technician arrives
    const candidateStartMs = Math.max(earliestArrivalMs, jobEarliestStart.getTime());
    const candidateEndMs = candidateStartMs + jobDurationMs;

    const candidateStart = new Date(candidateStartMs);
    const candidateEnd = new Date(candidateEndMs);

    // =========================================================================
    // HARD CONSTRAINT CHECKS FOR THIS TIME SLOT
    // =========================================================================

    // Constraint 4: Must fit inside shift end
    if (candidateEndMs > schedule.shiftEndUtc.getTime()) {
      continue;
    }

    // Constraint 5: Must finish no later than job's latestEnd
    if (candidateEndMs > jobLatestEnd.getTime()) {
      continue;
    }

    // Constraint 6: Must finish by SLA deadline (Hard Constraint)
    if (candidateEndMs > jobSlaDeadline.getTime()) {
      continue;
    }

    // Constraint 8: Must finish before gap.end (no overlap with next commitment)
    if (candidateEndMs > gap.end.getTime()) {
      continue;
    }

    // Constraint 7 & 8: If there is a subsequent commitment, technician must have enough
    // travel time from this job's location to the next commitment's location
    if (gap.nextLocation && gap.nextCommitmentStart) {
      const travelFrom = calculateTravelEstimate(jobLocation, gap.nextLocation);
      const departureForNextMs = candidateEndMs + travelFrom.travelTimeMinutes * 60 * 1000;
      if (departureForNextMs > gap.nextCommitmentStart.getTime()) {
        continue; // Insufficient transit time to reach next commitment
      }
    }

    // Constraint 9: Verify no overlap with registered unavailability periods
    const overlapsUnavailability = schedule.commitments.some(
      (c) =>
        c.type === 'UNAVAILABILITY' &&
        candidateStartMs < c.endTime.getTime() &&
        candidateEndMs > c.startTime.getTime()
    );
    if (overlapsUnavailability) {
      continue;
    }

    // Calculate idle time buffer before this candidate slot
    const idleGapMinutesBefore = Math.max(
      0,
      Math.round((candidateStartMs - earliestArrivalMs) / (60 * 1000))
    );

    feasibleSlots.push({
      scheduledStart: candidateStart,
      scheduledEnd: candidateEnd,
      travelTimeMinutes: travelTo.travelTimeMinutes,
      travelDistanceKm: travelTo.distanceKm,
      previousLocation: gap.prevLocation,
      nextLocation: gap.nextLocation,
      idleGapMinutesBefore,
    });
  }

  return feasibleSlots;
}
