import { prisma } from '../config/prisma';
import { AppError } from '../utils/appError';
import { transactionService } from '../services/transaction.service';
import { runSchedulingEngine, SchedulingEngineOptions } from './scheduling.engine';
import {
  DEFAULT_SCORING_WEIGHTS,
  SchedulingEngineResult,
  ScoringWeights,
} from './scheduling.types';

export interface GenerateScheduleRequest {
  runType?: 'INITIAL' | 'OPTIMIZATION' | 'RECOVERY';
  weights?: ScoringWeights;
  idempotencyKey?: string;
  referenceDate?: string;
}

export class SchedulingService {
  /**
   * Generates and commits a workforce schedule using the intelligent engine.
   * Supports idempotency caching and strict transactional database persistence.
   */
  async generateSchedule(
    request: GenerateScheduleRequest = {}
  ): Promise<SchedulingEngineResult> {
    const { runType = 'INITIAL', weights = DEFAULT_SCORING_WEIGHTS, idempotencyKey } = request;

    // 1. Check Idempotency Cache
    if (idempotencyKey) {
      const cached = await prisma.idempotencyRecord.findUnique({
        where: { idempotencyKey },
      });
      if (cached && cached.responseBody) {
        try {
          return JSON.parse(cached.responseBody) as SchedulingEngineResult;
        } catch {
          // If JSON parse fails, recompute
        }
      }
    }

    // 2. Fetch Technicians with their Unavailabilities and active Assignments
    const technicians = await prisma.technician.findMany({
      include: {
        unavailabilities: true,
        assignments: {
          where: { status: { not: 'CANCELLED' } },
          include: { job: true },
        },
      },
    });

    if (technicians.length === 0) {
      throw new AppError('No technicians available in database to schedule.', 400, 'NO_TECHNICIANS');
    }

    // 3. Fetch Jobs
    const jobs = await prisma.job.findMany({
      where: {
        status: { in: ['PENDING', 'UNASSIGNED'] },
      },
    });

    if (jobs.length === 0) {
      throw new AppError('No pending or unassigned jobs found for scheduling.', 400, 'NO_JOBS_TO_SCHEDULE');
    }

    // 4. Execute Core Scheduling Algorithm (In-Memory, Deterministic)
    const options: SchedulingEngineOptions = {
      runType,
      weights,
      referenceDate: request.referenceDate ? new Date(request.referenceDate) : undefined,
    };

    const engineResult = runSchedulingEngine(jobs, technicians, options);

    // 5. Transactional Persistence in SQLite with Retry on Lock Contention
    await transactionService.executeWithRetry(async (tx) => {
      // a. Create SchedulingRun record
      const run = await tx.schedulingRun.create({
        data: {
          id: engineResult.runId,
          runType: engineResult.runType,
          status: 'COMPLETED',
          objectiveScore: engineResult.objectiveScore,
          totalJobs: engineResult.metrics.totalJobs,
          assignedJobs: engineResult.metrics.assignedJobs,
          unassignedJobs: engineResult.metrics.unassignedJobs,
          totalTravelTime: engineResult.metrics.totalTravelTimeMinutes,
          slaViolations: engineResult.metrics.slaViolations,
          technicianUtilization: engineResult.metrics.technicianUtilization,
          completedAt: new Date(),
        },
      });

      // b. Process Assigned Jobs
      for (const decision of engineResult.decisions) {
        if (decision.isAssigned && decision.selectedTechnicianId && decision.selectedSlot) {
          // Create Assignment
          await tx.assignment.create({
            data: {
              jobId: decision.jobId,
              technicianId: decision.selectedTechnicianId,
              scheduledStart: decision.selectedSlot.scheduledStart,
              scheduledEnd: decision.selectedSlot.scheduledEnd,
              travelTime: decision.selectedSlot.travelTimeMinutes,
              status: 'SCHEDULED',
            },
          });

          // Update Job status to ASSIGNED
          await tx.job.update({
            where: { id: decision.jobId },
            data: { status: 'ASSIGNED' },
          });

          // Create SchedulingRunDetail
          await tx.schedulingRunDetail.create({
            data: {
              schedulingRunId: run.id,
              jobId: decision.jobId,
              selectedTechnicianId: decision.selectedTechnicianId,
              scheduledStart: decision.selectedSlot.scheduledStart,
              scheduledEnd: decision.selectedSlot.scheduledEnd,
              assignmentStatus: 'ASSIGNED',
              explanation: decision.explanation,
              rejectionReasons: JSON.stringify(decision.rejectionReasons),
            },
          });
        } else {
          // Update Job status to UNASSIGNED
          await tx.job.update({
            where: { id: decision.jobId },
            data: { status: 'UNASSIGNED' },
          });

          // Create SchedulingRunDetail for unassigned job
          await tx.schedulingRunDetail.create({
            data: {
              schedulingRunId: run.id,
              jobId: decision.jobId,
              assignmentStatus: 'UNASSIGNED',
              explanation: decision.explanation,
              rejectionReasons: JSON.stringify(decision.rejectionReasons),
            },
          });
        }
      }

      // c. Create Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'SCHEDULE',
          entityId: run.id,
          action: 'CREATE',
          description: `Scheduling run ${run.id} completed. Assigned: ${engineResult.metrics.assignedJobs}/${engineResult.metrics.totalJobs} jobs (${engineResult.metrics.successRate}%).`,
          newValue: JSON.stringify({
            runId: run.id,
            runType: run.runType,
            metrics: engineResult.metrics,
          }),
        },
      });

      // d. Record Idempotency Cache if key was provided
      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            idempotencyKey,
            operationType: 'OPTIMIZE_SCHEDULE',
            responseStatus: 200,
            responseBody: JSON.stringify(engineResult),
          },
        });
      }
    });

    return engineResult;
  }

  /**
   * Retrieves the current schedule state, including all active assignments and overall KPIs.
   */
  async getCurrentSchedule() {
    const assignments = await prisma.assignment.findMany({
      where: {
        status: { in: ['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS'] },
      },
      include: {
        job: true,
        technician: true,
      },
      orderBy: { scheduledStart: 'asc' },
    });

    const totalAssigned = assignments.length;
    const totalTravelTime = assignments.reduce((sum, a) => sum + a.travelTime, 0);
    const avgTravelTime = totalAssigned > 0 ? Math.round(totalTravelTime / totalAssigned) : 0;

    const latestRun = await prisma.schedulingRun.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    return {
      activeAssignmentsCount: totalAssigned,
      totalTravelMinutes: totalTravelTime,
      averageTravelMinutes: avgTravelTime,
      latestRun,
      assignments,
    };
  }

  /**
   * Retrieves paginated history of scheduling runs.
   */
  async getSchedulingRuns(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;
    const [total, runs] = await Promise.all([
      prisma.schedulingRun.count(),
      prisma.schedulingRun.findMany({
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: runs,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }

  /**
   * Retrieves a scheduling run by ID with detailed job assignment audits.
   */
  async getSchedulingRunById(id: string) {
    const run = await prisma.schedulingRun.findUnique({
      where: { id },
      include: {
        details: {
          include: {
            job: true,
            selectedTechnician: true,
            previousTechnician: true,
          },
        },
      },
    });

    if (!run) {
      throw new AppError(`Scheduling run with ID "${id}" not found.`, 404, 'RUN_NOT_FOUND');
    }

    return run;
  }

  /**
   * Retrieves the explanation and audit trail for a specific job from the latest run.
   */
  async getJobExplanation(jobId: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        assignments: {
          include: { technician: true },
        },
      },
    });

    if (!job) {
      throw new AppError(`Job with ID "${jobId}" not found.`, 404, 'JOB_NOT_FOUND');
    }

    const latestDetail = await prisma.schedulingRunDetail.findFirst({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      include: {
        selectedTechnician: true,
        schedulingRun: true,
      },
    });

    let parsedRejections: any[] = [];
    if (latestDetail?.rejectionReasons) {
      try {
        parsedRejections = JSON.parse(latestDetail.rejectionReasons);
      } catch {
        parsedRejections = [];
      }
    }

    return {
      job,
      latestDetail: latestDetail
        ? {
            ...latestDetail,
            rejectionReasons: parsedRejections,
          }
        : null,
    };
  }

  /**
   * Retrieves the comprehensive timeline schedule for a specific technician.
   */
  async getTechnicianSchedule(technicianId: string) {
    const technician = await prisma.technician.findUnique({
      where: { id: technicianId },
      include: {
        assignments: {
          where: { status: { not: 'CANCELLED' } },
          include: { job: true },
          orderBy: { scheduledStart: 'asc' },
        },
        unavailabilities: {
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!technician) {
      throw new AppError(
        `Technician with ID "${technicianId}" not found.`,
        404,
        'TECHNICIAN_NOT_FOUND'
      );
    }

    const totalAllocatedMinutes = technician.assignments.reduce(
      (sum, a) => sum + (a.job?.estimatedDuration || 0),
      0
    );
    const totalTravelMinutes = technician.assignments.reduce(
      (sum, a) => sum + a.travelTime,
      0
    );

    return {
      technician,
      totalAssignments: technician.assignments.length,
      totalAllocatedMinutes,
      totalTravelMinutes,
      timeline: [
        ...technician.assignments.map((a) => ({
          type: 'ASSIGNMENT',
          id: a.id,
          startTime: a.scheduledStart,
          endTime: a.scheduledEnd,
          duration: a.job?.estimatedDuration,
          travelTime: a.travelTime,
          job: a.job,
        })),
        ...technician.unavailabilities.map((u) => ({
          type: 'UNAVAILABILITY',
          id: u.id,
          startTime: u.startTime,
          endTime: u.endTime,
          reason: u.reason,
        })),
      ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    };
  }
}

export const schedulingService = new SchedulingService();
