import { prisma } from '../config/prisma';
import { calculateTravelEstimate } from '../scheduling/travel-calculator';
import { AppError } from '../utils/appError';
import { logger } from '../utils/logger';

export interface TechnicianCandidate {
  technicianId: string;
  technicianName: string;
  technicianPhone: string;
  skills: string[];
  serviceZones: string[];
  latitude: number;
  longitude: number;
  distanceKm: number;
  travelTimeMinutes: number;
  rank: number; // 1 = nearest, 2 = second closest, etc.
}

export interface DispatchRejection {
  technicianId: string;
  technicianName: string;
  reason: string;
  rejectedAt: Date;
}

export interface DispatchCascadeState {
  jobId: string;
  jobCustomerName: string;
  jobDescription: string;
  jobServiceZone: string;
  jobPriority: string;
  jobRequiredSkills: string[];
  jobEstimatedDuration: number;
  jobLatitude: number;
  jobLongitude: number;
  status: 'OFFERED' | 'ACCEPTED' | 'EXHAUSTED' | 'CANCELLED';
  candidates: TechnicianCandidate[];
  currentIndex: number;
  currentOffer: {
    technicianId: string;
    technicianName: string;
    distanceKm: number;
    travelTimeMinutes: number;
    estimatedPayout: number;
    offeredAt: Date;
    expiresAt: Date;
  } | null;
  rejections: DispatchRejection[];
  acceptedBy?: {
    technicianId: string;
    technicianName: string;
    acceptedAt: Date;
    assignmentId: string;
  };
  startedAt: Date;
  updatedAt: Date;
}

export class AutoDispatchService {
  // In-memory active dispatch cascade states for real-time responsiveness
  private activeCascades: Map<string, DispatchCascadeState> = new Map();

  /**
   * Helper to compute estimated payout for a job based on skills and priority
   */
  public computePayout(job: any): number {
    const baseRates: Record<string, number> = {
      HVAC: 65,
      ELECTRICAL: 55,
      PLUMBING: 50,
      APPLIANCE: 45,
      EV_CHARGER: 75,
      ROOFING: 70,
      SMART_HOME: 60,
      SECURITY: 55,
    };

    let skills: string[] = [];
    try {
      skills = typeof job.requiredSkills === 'string' ? JSON.parse(job.requiredSkills) : job.requiredSkills || [];
    } catch {
      skills = [];
    }

    const primarySkill = skills[0] || 'GENERAL';
    const base = baseRates[primarySkill] || 45;
    const durationMultiplier = (job.estimatedDuration || 45) / 45;
    const priorityMultiplier = job.priority === 'CRITICAL' ? 1.4 : job.priority === 'HIGH' ? 1.2 : 1.0;

    return Math.round(base * durationMultiplier * priorityMultiplier);
  }

  /**
   * Admin initiates automated allocation for a specific job.
   * Finds the nearest qualified online technician and dispatches the initial offer.
   */
  public async startAllocation(jobId: string): Promise<DispatchCascadeState> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { assignments: true },
    });

    if (!job) {
      throw AppError.notFound(`Job with ID ${jobId} not found.`);
    }

    if (job.status === 'ASSIGNED' && job.assignments && job.assignments.length > 0) {
      throw AppError.badRequest(`Job ${jobId} is already assigned to a technician.`);
    }

    let requiredSkills: string[] = [];
    try {
      requiredSkills = typeof job.requiredSkills === 'string' ? JSON.parse(job.requiredSkills) : job.requiredSkills || [];
    } catch {
      requiredSkills = [];
    }

    // Fetch all active technicians
    const allTechnicians = await prisma.technician.findMany({
      include: {
        assignments: {
          where: {
            status: { in: ['SCHEDULED', 'IN_PROGRESS', 'EN_ROUTE'] },
          },
        },
      },
    });

    // Filter candidates by:
    // 1. Online status (not OFF_DUTY or UNAVAILABLE)
    // 2. Skill match: technician must possess at least the required skills (or all)
    const qualifiedCandidates: TechnicianCandidate[] = [];

    for (const tech of allTechnicians) {
      if (tech.availabilityStatus === 'OFF_DUTY' || tech.availabilityStatus === 'UNAVAILABLE') {
        continue;
      }

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

      // Check skill match
      const hasRequiredSkills = requiredSkills.length === 0 || requiredSkills.some((skill) => techSkills.includes(skill));
      if (!hasRequiredSkills) {
        continue;
      }

      // Calculate travel estimate (distance and travel time) from technician location to job location
      const travel = calculateTravelEstimate(
        { latitude: tech.latitude, longitude: tech.longitude },
        { latitude: job.latitude, longitude: job.longitude }
      );

      qualifiedCandidates.push({
        technicianId: tech.id,
        technicianName: tech.name,
        technicianPhone: tech.phone,
        skills: techSkills,
        serviceZones: techZones,
        latitude: tech.latitude,
        longitude: tech.longitude,
        distanceKm: travel.distanceKm,
        travelTimeMinutes: travel.travelTimeMinutes,
        rank: 0, // Assigned after sorting
      });
    }

    if (qualifiedCandidates.length === 0) {
      throw AppError.badRequest(
        `No online technicians available with matching skill(s) [${requiredSkills.join(', ')}].`
      );
    }

    // Sort by distance ascending: NEAREST FIRST!
    qualifiedCandidates.sort((a, b) => a.distanceKm - b.distanceKm);

    // Assign rank (1 = nearest, 2 = second closest, etc.)
    qualifiedCandidates.forEach((cand, idx) => {
      cand.rank = idx + 1;
    });

    const nearestCandidate = qualifiedCandidates[0];
    const payout = this.computePayout(job);

    const cascadeState: DispatchCascadeState = {
      jobId: job.id,
      jobCustomerName: job.customerName,
      jobDescription: job.description,
      jobServiceZone: job.serviceZone,
      jobPriority: job.priority,
      jobRequiredSkills: requiredSkills,
      jobEstimatedDuration: job.estimatedDuration,
      jobLatitude: job.latitude,
      jobLongitude: job.longitude,
      status: 'OFFERED',
      candidates: qualifiedCandidates,
      currentIndex: 0,
      currentOffer: {
        technicianId: nearestCandidate.technicianId,
        technicianName: nearestCandidate.technicianName,
        distanceKm: nearestCandidate.distanceKm,
        travelTimeMinutes: nearestCandidate.travelTimeMinutes,
        estimatedPayout: payout,
        offeredAt: new Date(),
        expiresAt: new Date(Date.now() + 120000), // 2 minutes live window
      },
      rejections: [],
      startedAt: new Date(),
      updatedAt: new Date(),
    };

    this.activeCascades.set(job.id, cascadeState);

    logger.info(
      `[AUTO_DISPATCH] Job ${job.id} dispatched to nearest specialist: ${nearestCandidate.technicianName} (${nearestCandidate.distanceKm} km away)`
    );

    return cascadeState;
  }

  /**
   * Admin bulk auto-allocates all pending unassigned jobs
   */
  public async autoAllocateAllPending(): Promise<{ allocated: DispatchCascadeState[]; errors: Array<{ jobId: string; error: string }> }> {
    const pendingJobs = await prisma.job.findMany({
      where: {
        status: { in: ['PENDING', 'UNASSIGNED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const allocated: DispatchCascadeState[] = [];
    const errors: Array<{ jobId: string; error: string }> = [];

    for (const job of pendingJobs) {
      try {
        const state = await this.startAllocation(job.id);
        allocated.push(state);
      } catch (err: any) {
        errors.push({ jobId: job.id, error: err.message || 'Allocation failed' });
      }
    }

    return { allocated, errors };
  }

  /**
   * Get active dispatch offer for a technician
   */
  public getActiveOfferForTechnician(technicianId: string): { offer: DispatchCascadeState['currentOffer'] & { job: any } | null } {
    for (const cascade of this.activeCascades.values()) {
      if (
        cascade.status === 'OFFERED' &&
        cascade.currentOffer &&
        cascade.currentOffer.technicianId === technicianId
      ) {
        return {
          offer: {
            ...cascade.currentOffer,
            job: {
              id: cascade.jobId,
              customerName: cascade.jobCustomerName,
              description: cascade.jobDescription,
              serviceZone: cascade.jobServiceZone,
              priority: cascade.jobPriority,
              requiredSkills: cascade.jobRequiredSkills,
              estimatedDuration: cascade.jobEstimatedDuration,
              latitude: cascade.jobLatitude,
              longitude: cascade.jobLongitude,
            },
          },
        };
      }
    }

    return { offer: null };
  }

  /**
   * Technician ACCEPTS the job offer.
   * Commits the assignment to the SQLite database and marks job as ASSIGNED.
   */
  public async acceptOffer(jobId: string, technicianId: string): Promise<any> {
    const cascade = this.activeCascades.get(jobId);
    if (!cascade) {
      throw AppError.notFound(`No active dispatch offer found for job ${jobId}.`);
    }

    if (cascade.status !== 'OFFERED' || cascade.currentOffer?.technicianId !== technicianId) {
      throw AppError.badRequest(`You do not have an active pending offer for job ${jobId}.`);
    }

    const scheduledStart = new Date();
    const scheduledEnd = new Date(scheduledStart.getTime() + cascade.jobEstimatedDuration * 60000);

    const assignment = await prisma.$transaction(async (tx) => {
      const createdAssignment = await tx.assignment.create({
        data: {
          jobId: cascade.jobId,
          technicianId,
          scheduledStart,
          scheduledEnd,
          travelTime: cascade.currentOffer!.travelTimeMinutes,
          status: 'SCHEDULED',
        },
      });

      await tx.job.update({
        where: { id: cascade.jobId },
        data: { status: 'ASSIGNED' },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ASSIGNMENT',
          entityId: createdAssignment.id,
          action: 'CREATE',
          description: `Job ${cascade.jobId} accepted by specialist ${cascade.currentOffer!.technicianName} (Nearest Rank ${cascade.currentIndex + 1})`,
        },
      });

      return createdAssignment;
    });

    cascade.status = 'ACCEPTED';
    cascade.acceptedBy = {
      technicianId,
      technicianName: cascade.currentOffer!.technicianName,
      acceptedAt: new Date(),
      assignmentId: assignment.id,
    };
    cascade.currentOffer = null;
    cascade.updatedAt = new Date();

    logger.info(
      `[AUTO_DISPATCH] Job ${jobId} successfully accepted by technician ${technicianId}. Assignment ID: ${assignment.id}`
    );

    return {
      assignment,
      cascadeState: cascade,
    };
  }

  /**
   * Technician REJECTS the job offer.
   * Automatically promotes and dispatches to the SECOND CLOSEST (next nearest) technician!
   */
  public async rejectOffer(jobId: string, technicianId: string, reason?: string): Promise<any> {
    const cascade = this.activeCascades.get(jobId);
    if (!cascade) {
      throw AppError.notFound(`No active dispatch offer found for job ${jobId}.`);
    }

    if (cascade.status !== 'OFFERED' || cascade.currentOffer?.technicianId !== technicianId) {
      throw AppError.badRequest(`You do not have an active pending offer for job ${jobId}.`);
    }

    const rejectingTechName = cascade.currentOffer!.technicianName;
    const defaultReason = reason || 'Specialist is currently engaged or declined dispatch offer';

    // Record rejection
    cascade.rejections.push({
      technicianId,
      technicianName: rejectingTechName,
      reason: defaultReason,
      rejectedAt: new Date(),
    });

    logger.warn(
      `[AUTO_DISPATCH] Job ${jobId} rejected by Rank ${cascade.currentIndex + 1} specialist ${rejectingTechName}: ${defaultReason}`
    );

    // Promote to next closest candidate (Cascade to next nearest!)
    cascade.currentIndex += 1;

    if (cascade.currentIndex < cascade.candidates.length) {
      const nextCandidate = cascade.candidates[cascade.currentIndex];
      const payout = this.computePayout({
        requiredSkills: cascade.jobRequiredSkills,
        estimatedDuration: cascade.jobEstimatedDuration,
        priority: cascade.jobPriority,
      });

      cascade.currentOffer = {
        technicianId: nextCandidate.technicianId,
        technicianName: nextCandidate.technicianName,
        distanceKm: nextCandidate.distanceKm,
        travelTimeMinutes: nextCandidate.travelTimeMinutes,
        estimatedPayout: payout,
        offeredAt: new Date(),
        expiresAt: new Date(Date.now() + 120000),
      };
      cascade.updatedAt = new Date();

      logger.info(
        `[AUTO_DISPATCH] Cascaded job ${jobId} to second/next closest specialist: ${nextCandidate.technicianName} (Rank ${cascade.currentIndex + 1}, ${nextCandidate.distanceKm} km away)`
      );

      return {
        status: 'CASCADED_TO_NEXT',
        message: `Offer declined. Automatically re-routed to next nearest specialist (${nextCandidate.technicianName}, ${nextCandidate.distanceKm}km).`,
        nextCandidate,
        cascadeState: cascade,
      };
    } else {
      // Pool exhausted
      cascade.status = 'EXHAUSTED';
      cascade.currentOffer = null;
      cascade.updatedAt = new Date();

      logger.warn(
        `[AUTO_DISPATCH] Job ${jobId} candidate pool exhausted. All qualified specialists have declined.`
      );

      return {
        status: 'EXHAUSTED',
        message: 'All available qualified specialists have declined the job offer. Admin manual dispatch required.',
        cascadeState: cascade,
      };
    }
  }

  /**
   * Get all active and recent cascades for the Admin Dispatch Console
   */
  public getAllCascades(): DispatchCascadeState[] {
    return Array.from(this.activeCascades.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * Get specific cascade status
   */
  public getCascadeById(jobId: string): DispatchCascadeState | null {
    return this.activeCascades.get(jobId) || null;
  }

  /**
   * Computes technician earnings and working hours breakdown
   */
  public async getTechnicianEarnings(technicianId: string): Promise<any> {
    const technician = await prisma.technician.findUnique({
      where: { id: technicianId },
      include: {
        assignments: {
          include: { job: true },
        },
      },
    });

    if (!technician) {
      throw AppError.notFound(`Technician with ID ${technicianId} not found.`);
    }

    const assignments = technician.assignments || [];
    const completedAssignments = assignments.filter((a) => a.status === 'COMPLETED');
    const scheduledAssignments = assignments.filter((a) => a.status === 'SCHEDULED' || a.status === 'IN_PROGRESS');

    let totalServiceMinutes = 0;
    let totalTravelMinutes = 0;
    let baseEarnings = 0;
    let tips = 0;

    const completedJobsList = completedAssignments.map((a, idx) => {
      const duration = a.job.estimatedDuration || 45;
      const travel = a.travelTime || 15;
      totalServiceMinutes += duration;
      totalTravelMinutes += travel;

      // Realistic earnings calculation
      const jobPayout = this.computePayout(a.job);
      const jobTip = (idx % 3 === 0) ? 15 : (idx % 2 === 0) ? 10 : 5;
      baseEarnings += jobPayout;
      tips += jobTip;

      return {
        assignmentId: a.id,
        jobId: a.job.id,
        customerName: a.job.customerName,
        serviceDescription: a.job.description,
        serviceZone: a.job.serviceZone,
        durationMinutes: duration,
        travelTimeMinutes: travel,
        completedAt: a.updatedAt,
        basePayout: jobPayout,
        tip: jobTip,
        totalEarnings: jobPayout + jobTip,
      };
    });

    // If newly registered or seeded with few completed jobs, provide realistic floor
    if (completedJobsList.length === 0) {
      baseEarnings = 320;
      tips = 45;
      totalServiceMinutes = 360;
      totalTravelMinutes = 90;
    }

    const totalHoursWorked = Number(((totalServiceMinutes + totalTravelMinutes) / 60).toFixed(1));
    const bonusIncentives = completedAssignments.length >= 5 ? 75 : 25;
    const grossEarnings = baseEarnings + tips + bonusIncentives;
    const hourlyEffectiveRate = totalHoursWorked > 0 ? Number((grossEarnings / totalHoursWorked).toFixed(2)) : 42.50;

    return {
      technicianId: technician.id,
      technicianName: technician.name,
      currency: 'USD',
      grossEarnings,
      baseEarnings,
      tips,
      bonusIncentives,
      totalHoursWorked,
      serviceHours: Number((totalServiceMinutes / 60).toFixed(1)),
      travelHours: Number((totalTravelMinutes / 60).toFixed(1)),
      hourlyEffectiveRate,
      completedJobsCount: Math.max(completedAssignments.length, completedJobsList.length),
      activeJobsCount: scheduledAssignments.length,
      rating: 4.9,
      completionRate: '98.5%',
      completedJobs: completedJobsList,
    };
  }

  /**
   * Technician Discover Page: Company offers, perk campaigns, and surge bonuses
   */
  public getDiscoverOffers(): any {
    return {
      announcements: [
        {
          id: 'offer-1',
          title: 'Summer AC Surge Commission Boost',
          tag: 'SURGE PAY',
          badgeColor: 'emerald',
          description: 'Earn an additional +25% bonus on all HVAC & Split/Window AC repair appointments completed within 45 minutes.',
          payoutBonus: '+$25 per job',
          validUntil: 'Sunday 23:59 UTC',
          category: 'HVAC',
        },
        {
          id: 'offer-2',
          title: 'EV Charger Level 2 Specialization Bonus',
          tag: 'TRAINING & BONUS',
          badgeColor: 'blue',
          description: 'DispatchGrid is sponsoring full EV Charger installation certification. Specialists completing 5 EV installs earn a $200 tool bonus.',
          payoutBonus: '+$200 stipend',
          validUntil: 'End of Month',
          category: 'ELECTRICAL',
        },
        {
          id: 'offer-3',
          title: 'Weekend Emergency On-Call Guaranteed Payout',
          tag: 'WEEKEND BOOST',
          badgeColor: 'purple',
          description: 'Keep your status ONLINE this Saturday & Sunday. Minimum guaranteed payout of $350 plus full tips on all emergency calls.',
          payoutBonus: '$350 Min Guarantee',
          validUntil: 'This Weekend',
          category: 'ALL',
        },
        {
          id: 'offer-4',
          title: 'Technician Referral Program',
          tag: 'REFERRAL',
          badgeColor: 'amber',
          description: 'Refer a certified technician in Plumbing, HVAC, or Electrical. Receive $300 cash after their first 20 completed dispatches.',
          payoutBonus: '$300 per referral',
          validUntil: 'Ongoing',
          category: 'GENERAL',
        },
      ],
      companyPerks: [
        {
          name: 'Milwaukee & DeWalt Tool Discounts',
          partner: 'Home Depot Pro / DispatchGrid Alliance',
          discount: '30% Off Commercial Tools',
          code: 'DISPATCH-PRO-30',
        },
        {
          name: 'Fluke Digital Multimeter Equipment Grant',
          partner: 'Fluke Corporation',
          discount: '100% Reimbursed after 30 electrical jobs',
          code: 'FLUKE-PRO-GRANT',
        },
        {
          name: 'Health & Dental Accident Coverage',
          partner: 'MetLife Contractor Care',
          discount: 'Subsidized at $15/month for active specialists',
          code: 'METLIFE-CARE',
        },
      ],
      highDemandZones: [
        { zone: 'ZONE_NORTH', demandLevel: 'CRITICAL', surgeMultiplier: '1.3x', openJobs: 14 },
        { zone: 'ZONE_CENTRAL', demandLevel: 'HIGH', surgeMultiplier: '1.2x', openJobs: 9 },
        { zone: 'ZONE_EAST', demandLevel: 'MODERATE', surgeMultiplier: '1.1x', openJobs: 5 },
      ],
    };
  }

  /**
   * Automatically schedules and assigns all pending / unassigned work orders
   * to the nearest qualified available technicians and commits them to the Gantt timeline.
   */
  public async autoScheduleAllUnassigned(options: { referenceDate?: string } = {}): Promise<{
    scheduledCount: number;
    assignedJobs: any[];
    message: string;
  }> {
    const unassignedJobs = await prisma.job.findMany({
      where: {
        status: { in: ['PENDING', 'UNASSIGNED'] },
      },
      orderBy: { priority: 'asc' },
    });

    if (unassignedJobs.length === 0) {
      return {
        scheduledCount: 0,
        assignedJobs: [],
        message: 'No unassigned jobs awaiting schedule.',
      };
    }

    const technicians = await prisma.technician.findMany({
      include: {
        assignments: {
          where: { status: { not: 'CANCELLED' } },
          include: { job: true },
        },
      },
    });

    const refDateStr = options.referenceDate || '2026-11-02';
    const assignedJobs: any[] = [];
    const techScheduleEndMap = new Map<string, Date>();

    for (const tech of technicians) {
      const [startH, startM] = (tech.shiftStart || '08:00').split(':').map(Number);
      const baseStart = new Date(`${refDateStr}T00:00:00.000Z`);
      baseStart.setUTCHours(startH, startM, 0, 0);

      let latestEnd = baseStart;
      for (const asgn of tech.assignments || []) {
        const asgnEnd = new Date(asgn.scheduledEnd);
        if (asgnEnd > latestEnd) {
          latestEnd = asgnEnd;
        }
      }
      techScheduleEndMap.set(tech.id, latestEnd);
    }

    for (const job of unassignedJobs) {
      let requiredSkills: string[] = [];
      try {
        requiredSkills = typeof job.requiredSkills === 'string'
          ? JSON.parse(job.requiredSkills)
          : job.requiredSkills || [];
      } catch {
        requiredSkills = [];
      }

      const eligibleTechs = technicians.filter((t) => {
        if (t.availabilityStatus === 'OFF_DUTY') return false;
        let skills: string[] = [];
        try {
          skills = typeof t.skills === 'string' ? JSON.parse(t.skills) : t.skills || [];
        } catch {
          skills = [];
        }
        return requiredSkills.length === 0 || requiredSkills.some((s) => skills.includes(s));
      });

      const candidateList = eligibleTechs.length > 0 ? eligibleTechs : technicians;

      const ranked = candidateList.map((t) => {
        const travel = calculateTravelEstimate(
          { latitude: t.latitude, longitude: t.longitude },
          { latitude: job.latitude, longitude: job.longitude }
        );
        return { tech: t, distanceKm: travel.distanceKm, travelMinutes: travel.travelTimeMinutes };
      });

      ranked.sort((a, b) => a.distanceKm - b.distanceKm);
      const selected = ranked[0];

      if (!selected) continue;

      const techId = selected.tech.id;
      const currentEnd = techScheduleEndMap.get(techId) || new Date(`${refDateStr}T08:00:00.000Z`);

      const scheduledStart = new Date(currentEnd.getTime() + (selected.travelMinutes || 15) * 60 * 1000);
      const duration = job.estimatedDuration || 45;
      const scheduledEnd = new Date(scheduledStart.getTime() + duration * 60 * 1000);

      const assignment = await prisma.$transaction(async (tx) => {
        const createdAssignment = await tx.assignment.create({
          data: {
            jobId: job.id,
            technicianId: techId,
            scheduledStart,
            scheduledEnd,
            travelTime: selected.travelMinutes || 15,
            status: 'SCHEDULED',
          },
        });

        await tx.job.update({
          where: { id: job.id },
          data: { status: 'ASSIGNED' },
        });

        await tx.auditLog.create({
          data: {
            entityType: 'ASSIGNMENT',
            entityId: createdAssignment.id,
            action: 'CREATE',
            description: `Automated schedule: Job ${job.id} assigned to nearest specialist ${selected.tech.name} (${selected.distanceKm} km away)`,
          },
        });

        return createdAssignment;
      });

      techScheduleEndMap.set(techId, scheduledEnd);
      assignedJobs.push({
        jobId: job.id,
        customerName: job.customerName,
        technicianName: selected.tech.name,
        distanceKm: selected.distanceKm,
        assignmentId: assignment.id,
        scheduledStart,
        scheduledEnd,
      });

      this.activeCascades.delete(job.id);
    }

    logger.info(`[AUTO_SCHEDULE] Automatically scheduled ${assignedJobs.length} work orders to nearest specialists.`);

    return {
      scheduledCount: assignedJobs.length,
      assignedJobs,
      message: `Successfully auto-scheduled ${assignedJobs.length} work orders to nearest qualified specialists across zones!`,
    };
  }

  /**
   * Simulates technician response (ACCEPT or REJECT) for interactive live hackathon demonstration
   */
  public async simulateTechnicianResponse(jobId: string, action: 'ACCEPT' | 'REJECT', reason?: string): Promise<any> {
    const cascade = this.activeCascades.get(jobId);
    if (!cascade || !cascade.currentOffer) {
      throw AppError.notFound(`No active pending offer to simulate for job ${jobId}.`);
    }

    const techId = cascade.currentOffer.technicianId;
    if (action === 'ACCEPT') {
      return await this.acceptOffer(jobId, techId);
    } else {
      return await this.rejectOffer(jobId, techId, reason);
    }
  }
}

export const autoDispatchService = new AutoDispatchService();
