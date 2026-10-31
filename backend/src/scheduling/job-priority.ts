export interface PrioritizedJob {
  job: any;
  priorityScore: number;
  urgencyScore: number;
  difficultyScore: number;
  totalCompositeScore: number;
}

const PRIORITY_BASE_VALUES: Record<string, number> = {
  CRITICAL: 100000,
  HIGH: 50000,
  MEDIUM: 20000,
  LOW: 10000,
};

/**
 * Calculates a deterministic composite scheduling priority score for a job.
 * 
 * Order of significance:
 * 1. Base Priority: CRITICAL >> HIGH >> MEDIUM >> LOW
 * 2. SLA Urgency: Closer SLA deadlines receive significant score boosts
 * 3. Time Window Tightness: Tighter appointment windows (latestEnd - earliestStart vs duration)
 * 4. Scheduling Difficulty: Jobs with fewer eligible technicians or longer durations
 * 5. Deterministic Tie-Breaking: Consistent lexicographical ordering by job ID
 */
export function calculateJobPriorityScore(
  job: any,
  eligibleTechCount = 5,
  referenceTime = new Date('2026-11-02T00:00:00.000Z')
): PrioritizedJob {
  const basePriority = PRIORITY_BASE_VALUES[job.priority] || PRIORITY_BASE_VALUES.MEDIUM;

  // 1. SLA Urgency Boost
  const slaDate = new Date(job.slaDeadline);
  const diffHours = (slaDate.getTime() - referenceTime.getTime()) / (1000 * 60 * 60);
  // Fewer hours until SLA deadline yields higher score (capped between 0 and 24 hours)
  const normalizedSlaHours = Math.max(0, Math.min(24, diffHours));
  const slaUrgencyScore = Math.round((24 - normalizedSlaHours) * 1000);

  // 2. Time Window Tightness Boost
  const earliest = new Date(job.earliestStart).getTime();
  const latest = new Date(job.latestEnd).getTime();
  const windowMinutes = Math.max(1, (latest - earliest) / (1000 * 60));
  const durationMinutes = Math.max(1, job.estimatedDuration);
  // Ratio >= 1.0; closer to 1.0 means extremely tight constraint
  const tightnessRatio = windowMinutes / durationMinutes;
  const tightnessScore = Math.round(Math.max(0, 10 - Math.min(10, tightnessRatio)) * 500);

  // 3. Scheduling Difficulty & Scarcity Boost
  // Fewer eligible technicians means the job is at higher risk of becoming unassignable
  const scarcityScore = Math.max(0, 30 - Math.min(30, eligibleTechCount)) * 300;
  // Longer jobs are harder to place in schedule gaps
  const durationScore = Math.min(240, durationMinutes) * 10;
  const difficultyScore = scarcityScore + durationScore + tightnessScore;

  const totalCompositeScore = basePriority + slaUrgencyScore + difficultyScore;

  return {
    job,
    priorityScore: basePriority,
    urgencyScore: slaUrgencyScore,
    difficultyScore,
    totalCompositeScore,
  };
}

/**
 * Sorts jobs deterministically for sequential scheduling evaluation.
 * Primary: Composite Priority Score (Descending)
 * Secondary: Earliest Start Date (Ascending)
 * Tertiary: Job UUID string (Ascending tie-breaker)
 */
export function sortJobsForScheduling(
  jobs: any[],
  technicians: any[],
  referenceTime?: Date
): any[] {
  const scoredJobs = jobs.map((job) => {
    // Quick estimation of eligible tech count for difficulty weighting
    let eligibleCount = 0;
    let requiredSkills: string[] = [];
    try {
      requiredSkills = typeof job.requiredSkills === 'string'
        ? JSON.parse(job.requiredSkills)
        : job.requiredSkills || [];
    } catch {
      requiredSkills = [];
    }

    for (const t of technicians) {
      let tSkills: string[] = [];
      let tZones: string[] = [];
      try {
        tSkills = typeof t.skills === 'string' ? JSON.parse(t.skills) : t.skills || [];
        tZones = typeof t.serviceZones === 'string' ? JSON.parse(t.serviceZones) : t.serviceZones || [];
      } catch {
        continue;
      }

      const hasSkills = requiredSkills.every((s) => tSkills.includes(s));
      const hasZone = tZones.includes(job.serviceZone);
      if (hasSkills && hasZone) {
        eligibleCount++;
      }
    }

    return calculateJobPriorityScore(job, eligibleCount, referenceTime);
  });

  scoredJobs.sort((a, b) => {
    // 1. Primary: Composite Score
    if (b.totalCompositeScore !== a.totalCompositeScore) {
      return b.totalCompositeScore - a.totalCompositeScore;
    }

    // 2. Secondary: Earliest Start (earlier jobs first)
    const startA = new Date(a.job.earliestStart).getTime();
    const startB = new Date(b.job.earliestStart).getTime();
    if (startA !== startB) {
      return startA - startB;
    }

    // 3. Stable Tie-breaker: Job ID
    return a.job.id.localeCompare(b.job.id);
  });

  return scoredJobs.map((item) => item.job);
}
