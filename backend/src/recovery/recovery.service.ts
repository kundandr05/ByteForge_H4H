import { prisma } from '../config/prisma';
import { AppError } from '../utils/appError';
import { transactionService } from '../services/transaction.service';
import { runRecoveryEngine, RecoveryEngineInput } from './recovery.engine';
import {
  DisruptionEventType,
  RecoveryEngineOptions,
  RecoveryEngineResult,
} from './recovery.types';

export interface CreateDisruptionDTO {
  eventType: DisruptionEventType;
  technicianId?: string;
  jobId?: string;
  description: string;
  eventPayload?: any;
}

export class RecoveryService {
  /**
   * Registers a new operational disruption event.
   */
  async createDisruption(dto: CreateDisruptionDTO) {
    const payloadStr = dto.eventPayload
      ? typeof dto.eventPayload === 'string'
        ? dto.eventPayload
        : JSON.stringify(dto.eventPayload)
      : null;

    // Check for duplicate pending disruption submission to ensure idempotency
    if (dto.technicianId || dto.jobId) {
      const existingPending = await prisma.disruptionEvent.findFirst({
        where: {
          eventType: dto.eventType,
          technicianId: dto.technicianId || null,
          jobId: dto.jobId || null,
          recoveryStatus: 'PENDING',
        },
        include: {
          technician: true,
          job: true,
        },
      });

      if (existingPending) {
        return existingPending;
      }
    }

    const event = await prisma.disruptionEvent.create({
      data: {
        eventType: dto.eventType,
        technicianId: dto.technicianId || null,
        jobId: dto.jobId || null,
        description: dto.description,
        eventPayload: payloadStr,
        recoveryStatus: 'PENDING',
      },
      include: {
        technician: true,
        job: true,
      },
    });

    return event;
  }

  /**
   * Lists historical disruptions with pagination and filtering.
   */
  async getDisruptions(page = 1, limit = 20, status?: string, type?: string) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;
    const where: any = {};
    if (status) where.recoveryStatus = status;
    if (type) where.eventType = type;

    const [total, disruptions] = await Promise.all([
      prisma.disruptionEvent.count({ where }),
      prisma.disruptionEvent.findMany({
        where,
        skip,
        take: safeLimit,
        include: {
          technician: true,
          job: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: disruptions,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }

  /**
   * Retrieves a single disruption event by UUID.
   */
  async getDisruptionById(id: string) {
    const event = await prisma.disruptionEvent.findUnique({
      where: { id },
      include: {
        technician: true,
        job: true,
      },
    });

    if (!event) {
      throw new AppError(`Disruption event with ID "${id}" not found.`, 404, 'DISRUPTION_NOT_FOUND');
    }

    return event;
  }

  /**
   * Executes the intelligent recovery engine for a registered disruption event,
   * transactionally reassigning jobs and updating system state.
   */
  async recoverDisruption(
    disruptionId: string,
    options: RecoveryEngineOptions & { idempotencyKey?: string } = {}
  ): Promise<RecoveryEngineResult> {
    const { idempotencyKey } = options;

    // Check idempotency cache
    if (idempotencyKey) {
      const cached = await prisma.idempotencyRecord.findUnique({
        where: { idempotencyKey },
      });
      if (cached && cached.responseBody) {
        try {
          return JSON.parse(cached.responseBody) as RecoveryEngineResult;
        } catch {
          // Recompute if parsing fails
        }
      }
    }

    const event = await this.getDisruptionById(disruptionId);

    if (event.recoveryStatus === 'RESOLVED') {
      // Already resolved, return report
      const report = await this.getRecoveryReport(disruptionId);
      return report.result;
    }

    let parsedPayload: any = null;
    if (event.eventPayload) {
      try {
        parsedPayload = JSON.parse(event.eventPayload);
      } catch {
        parsedPayload = null;
      }
    }

    // Load active assignments, technicians, and jobs
    const activeAssignments = await prisma.assignment.findMany({
      where: { status: { not: 'CANCELLED' } },
      include: { job: true, technician: true },
    });

    const technicians = await prisma.technician.findMany({
      include: { unavailabilities: true },
    });

    const allJobs = await prisma.job.findMany();

    const input: RecoveryEngineInput = {
      disruptionId,
      eventType: event.eventType as DisruptionEventType,
      technicianId: event.technicianId,
      jobId: event.jobId,
      eventPayload: parsedPayload,
      activeAssignments,
      allJobs,
      technicians,
      options,
    };

    // Execute in-memory recovery
    const result = runRecoveryEngine(input);

    // Transactional Persistence with Retry on Lock Contention
    await transactionService.executeWithRetry(async (tx) => {
      // 1. Create SchedulingRun with runType RECOVERY
      const run = await tx.schedulingRun.create({
        data: {
          id: result.runId,
          runType: 'RECOVERY',
          status: 'COMPLETED',
          objectiveScore: result.metrics.recoverySuccessRate,
          totalJobs: allJobs.length,
          assignedJobs: result.updatedAssignments.length,
          unassignedJobs: result.unassignedJobIds.length,
          totalTravelTime: result.metrics.travelMinutesAfter,
          slaViolations: result.metrics.slaViolationsAfter,
          technicianUtilization: 0,
          completedAt: new Date(),
        },
      });

      // 2. Scenario specific DB updates
      if (event.eventType === 'TECHNICIAN_UNAVAILABLE' && event.technicianId) {
        await tx.technician.update({
          where: { id: event.technicianId },
          data: { availabilityStatus: 'UNAVAILABLE' },
        });

        // Add unavailability record
        const unavailStart = parsedPayload?.startTime ? new Date(parsedPayload.startTime) : new Date();
        const unavailEnd = parsedPayload?.endTime
          ? new Date(parsedPayload.endTime)
          : new Date(Date.now() + 8 * 60 * 60 * 1000);

        await tx.technicianUnavailability.create({
          data: {
            technicianId: event.technicianId,
            startTime: unavailStart,
            endTime: unavailEnd,
            reason: event.description,
          },
        });
      }

      if (event.eventType === 'JOB_CANCELLED' && event.jobId) {
        await tx.job.update({
          where: { id: event.jobId },
          data: { status: 'CANCELLED' },
        });
        await tx.assignment.updateMany({
          where: { jobId: event.jobId },
          data: { status: 'CANCELLED' },
        });
      }

      if (event.eventType === 'JOB_DURATION_CHANGED' && event.jobId && parsedPayload?.newDurationMinutes) {
        await tx.job.update({
          where: { id: event.jobId },
          data: { estimatedDuration: parsedPayload.newDurationMinutes },
        });
      }

      if (
        (event.eventType === 'EARLY_COMPLETION' || event.eventType === 'DELAYED_COMPLETION') &&
        event.jobId
      ) {
        await tx.job.update({
          where: { id: event.jobId },
          data: { status: 'COMPLETED' },
        });
        await tx.assignment.updateMany({
          where: { jobId: event.jobId },
          data: { status: 'COMPLETED' },
        });
      }

      // 3. Update unassigned jobs
      for (const unassignedId of result.unassignedJobIds) {
        await tx.job.update({
          where: { id: unassignedId },
          data: { status: 'UNASSIGNED' },
        });
        await tx.assignment.updateMany({
          where: { jobId: unassignedId },
          data: { status: 'CANCELLED' },
        });
      }

      // 4. Update or create reassigned/slid assignments
      for (const asgn of result.updatedAssignments) {
        const existing = activeAssignments.find((a) => a.jobId === asgn.jobId);
        if (existing) {
          await tx.assignment.updateMany({
            where: { jobId: asgn.jobId },
            data: {
              technicianId: asgn.technicianId,
              scheduledStart: asgn.scheduledStart,
              scheduledEnd: asgn.scheduledEnd,
              travelTime: asgn.travelTime,
              status: asgn.status,
            },
          });
        } else {
          // New assignment (e.g. urgent job arrival)
          await tx.assignment.create({
            data: {
              jobId: asgn.jobId,
              technicianId: asgn.technicianId,
              scheduledStart: asgn.scheduledStart,
              scheduledEnd: asgn.scheduledEnd,
              travelTime: asgn.travelTime,
              status: asgn.status,
            },
          });
          await tx.job.update({
            where: { id: asgn.jobId },
            data: { status: 'ASSIGNED' },
          });
        }
      }

      // 5. Create SchedulingRunDetail records
      for (const action of result.actions) {
        let assignmentStatus = 'REASSIGNED';
        if (action.actionType === 'DISPATCH_NEW') assignmentStatus = 'ASSIGNED';
        else if (action.actionType === 'MARK_UNASSIGNED' || action.actionType === 'CANCEL') {
          assignmentStatus = 'UNASSIGNED';
        }

        await tx.schedulingRunDetail.create({
          data: {
            schedulingRunId: run.id,
            jobId: action.jobId,
            selectedTechnicianId: action.newTechnicianId,
            previousTechnicianId: action.previousTechnicianId,
            scheduledStart: action.newStart,
            scheduledEnd: action.newEnd,
            assignmentStatus,
            explanation: action.explanation,
            rejectionReasons: action.failureCode
              ? JSON.stringify({
                  code: action.failureCode,
                  suggestedAction: action.suggestedAction,
                })
              : null,
          },
        });
      }

      // 6. Update DisruptionEvent recoveryStatus
      await tx.disruptionEvent.update({
        where: { id: disruptionId },
        data: {
          recoveryStatus: result.recoveryStatus,
          resolvedAt: new Date(),
        },
      });

      // 7. Create AuditLog
      await tx.auditLog.create({
        data: {
          entityType: 'DISRUPTION',
          entityId: disruptionId,
          action: 'REASSIGN',
          description: `Disruption ${disruptionId} (${event.eventType}) recovered with status ${result.recoveryStatus}: ${result.metrics.recoveredJobsCount} recovered, ${result.metrics.unrecoveredJobsCount} unrecovered.`,
          newValue: JSON.stringify({
            runId: run.id,
            metrics: result.metrics,
            actions: result.actions,
            actionsCount: result.actions.length,
          }),
        },
      });

      // 8. Cache Idempotency Record if key provided
      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            idempotencyKey,
            operationType: 'RESOLVE_DISRUPTION',
            responseStatus: 200,
            responseBody: JSON.stringify(result),
          },
        });
      }
    });

    return result;
  }

  /**
   * Retrieves a comprehensive recovery report for a resolved disruption event.
   */
  async getRecoveryReport(disruptionId: string) {
    const event = await this.getDisruptionById(disruptionId);

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'DISRUPTION',
        entityId: disruptionId,
        action: 'REASSIGN',
      },
      orderBy: { createdAt: 'desc' },
    });

    let details: any = null;
    if (audit?.newValue) {
      try {
        details = JSON.parse(audit.newValue);
      } catch {
        details = null;
      }
    }

    const run = details?.runId
      ? await prisma.schedulingRun.findUnique({
          where: { id: details.runId },
          include: {
            details: {
              include: {
                job: true,
                selectedTechnician: true,
                previousTechnician: true,
              },
            },
          },
        })
      : null;

    return {
      disruption: event,
      run,
      result: details,
    };
  }

  /**
   * Retrieves paginated recovery run history.
   */
  async getRecoveryHistory(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;
    const [total, runs] = await Promise.all([
      prisma.schedulingRun.count({ where: { runType: 'RECOVERY' } }),
      prisma.schedulingRun.findMany({
        where: { runType: 'RECOVERY' },
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
   * Retrieves the before-and-after metrics comparison for a recovery run.
   */
  async getRecoveryComparison(runId: string) {
    const run = await prisma.schedulingRun.findFirst({
      where: { id: runId, runType: 'RECOVERY' },
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
      throw new AppError(`Recovery run with ID "${runId}" not found.`, 404, 'RUN_NOT_FOUND');
    }

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'DISRUPTION',
        newValue: { contains: runId },
      },
    });

    let metricsData = null;
    if (audit?.newValue) {
      try {
        const parsed = JSON.parse(audit.newValue);
        metricsData = parsed.metrics || null;
      } catch {
        metricsData = null;
      }
    }

    return {
      run,
      metrics: metricsData,
    };
  }
}

export const recoveryService = new RecoveryService();
