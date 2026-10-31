import { prisma } from '../config/prisma';
import { AppError } from '../utils/appError';
import { transactionService } from '../services/transaction.service';
import { runOptimizationEngine } from './optimization.engine';
import {
  OptimizationEngineOptions,
  OptimizationEngineResult,
  OptimizationWeights,
} from './optimization.types';

export interface OptimizationRequest {
  maxIterations?: number;
  maxDurationMs?: number;
  minImprovementThreshold?: number;
  weights?: Partial<OptimizationWeights>;
  idempotencyKey?: string;
  referenceDate?: string;
}

export class OptimizationService {
  /**
   * Previews schedule optimization in-memory without making any changes to the database.
   */
  async previewOptimization(
    request: OptimizationRequest = {}
  ): Promise<OptimizationEngineResult> {
    const { assignments, jobs, technicians } = await this.loadScheduleData();

    const options: OptimizationEngineOptions = {
      maxIterations: request.maxIterations,
      maxDurationMs: request.maxDurationMs,
      minImprovementThreshold: request.minImprovementThreshold,
      weights: request.weights,
      referenceDate: request.referenceDate ? new Date(request.referenceDate) : undefined,
    };

    return runOptimizationEngine(assignments, jobs, technicians, options);
  }

  /**
   * Executes schedule optimization and transactionally commits changes to the database.
   */
  async runOptimization(
    request: OptimizationRequest = {}
  ): Promise<OptimizationEngineResult> {
    const { idempotencyKey } = request;

    // 1. Check Idempotency Cache
    if (idempotencyKey) {
      const cached = await prisma.idempotencyRecord.findUnique({
        where: { idempotencyKey },
      });
      if (cached && cached.responseBody) {
        try {
          return JSON.parse(cached.responseBody) as OptimizationEngineResult;
        } catch {
          // If JSON parse fails, recompute
        }
      }
    }

    const { assignments, jobs, technicians } = await this.loadScheduleData();

    const options: OptimizationEngineOptions = {
      maxIterations: request.maxIterations,
      maxDurationMs: request.maxDurationMs,
      minImprovementThreshold: request.minImprovementThreshold,
      weights: request.weights,
      referenceDate: request.referenceDate ? new Date(request.referenceDate) : undefined,
    };

    // 2. Execute In-Memory Optimization Engine
    const result = runOptimizationEngine(assignments, jobs, technicians, options);

    // 3. Transactional Persistence in SQLite with Retry on Lock Contention
    await transactionService.executeWithRetry(async (tx) => {
      // a. Create SchedulingRun record with runType OPTIMIZATION
      const run = await tx.schedulingRun.create({
        data: {
          id: result.runId,
          runType: 'OPTIMIZATION',
          status: 'COMPLETED',
          objectiveScore: result.optimizedMetrics.qualityScore,
          totalJobs: result.optimizedMetrics.totalJobs,
          assignedJobs: result.optimizedMetrics.assignedJobs,
          unassignedJobs: result.optimizedMetrics.unassignedJobs,
          totalTravelTime: result.optimizedMetrics.totalTravelMinutes,
          slaViolations: result.optimizedMetrics.slaViolations,
          technicianUtilization: result.optimizedMetrics.technicianUtilization,
          completedAt: new Date(),
        },
      });

      // b. Map of changed jobs
      const changeMap = new Map(result.changes.map((c) => [c.jobId, c]));

      // c. Update assignments in database
      for (const optAsgn of result.optimizedAssignments) {
        const existing = assignments.find((a) => a.jobId === optAsgn.jobId);
        const change = changeMap.get(optAsgn.jobId);

        if (existing) {
          const hasTimeOrTechChanged =
            existing.technicianId !== optAsgn.technicianId ||
            new Date(existing.scheduledStart).getTime() !== new Date(optAsgn.scheduledStart).getTime() ||
            new Date(existing.scheduledEnd).getTime() !== new Date(optAsgn.scheduledEnd).getTime() ||
            (existing.travelTime || 0) !== (optAsgn.travelTime || 0);

          // Update existing assignment if modified or time shifted
          if (change || hasTimeOrTechChanged) {
            await tx.assignment.updateMany({
              where: { jobId: optAsgn.jobId },
              data: {
                technicianId: optAsgn.technicianId,
                scheduledStart: optAsgn.scheduledStart,
                scheduledEnd: optAsgn.scheduledEnd,
                travelTime: optAsgn.travelTime,
              },
            });
          }

          if (change) {

            // Create Run Detail for changed assignment
            await tx.schedulingRunDetail.create({
              data: {
                schedulingRunId: run.id,
                jobId: optAsgn.jobId,
                selectedTechnicianId: optAsgn.technicianId,
                previousTechnicianId: change.previousTechnicianId,
                scheduledStart: optAsgn.scheduledStart,
                scheduledEnd: optAsgn.scheduledEnd,
                assignmentStatus: 'REASSIGNED',
                explanation: change.reason,
                rejectionReasons: JSON.stringify({
                  travelImpactMinutes: change.travelImpactMinutes,
                  workloadImpactMinutes: change.workloadImpactMinutes,
                  slaImpactMinutes: change.slaImpactMinutes,
                  scoreDelta: change.scoreDelta,
                }),
              },
            });
          } else {
            // Unchanged assignment
            await tx.schedulingRunDetail.create({
              data: {
                schedulingRunId: run.id,
                jobId: optAsgn.jobId,
                selectedTechnicianId: optAsgn.technicianId,
                previousTechnicianId: optAsgn.technicianId,
                scheduledStart: optAsgn.scheduledStart,
                scheduledEnd: optAsgn.scheduledEnd,
                assignmentStatus: 'ASSIGNED',
                explanation: 'Retained optimal baseline assignment.',
              },
            });
          }
        } else {
          // Newly assigned job (previously unassigned)
          await tx.assignment.create({
            data: {
              jobId: optAsgn.jobId,
              technicianId: optAsgn.technicianId,
              scheduledStart: optAsgn.scheduledStart,
              scheduledEnd: optAsgn.scheduledEnd,
              travelTime: optAsgn.travelTime,
              status: 'SCHEDULED',
            },
          });

          await tx.job.update({
            where: { id: optAsgn.jobId },
            data: { status: 'ASSIGNED' },
          });

          await tx.schedulingRunDetail.create({
            data: {
              schedulingRunId: run.id,
              jobId: optAsgn.jobId,
              selectedTechnicianId: optAsgn.technicianId,
              scheduledStart: optAsgn.scheduledStart,
              scheduledEnd: optAsgn.scheduledEnd,
              assignmentStatus: 'ASSIGNED',
              explanation: change?.reason || 'Newly dispatched during schedule optimization.',
            },
          });
        }
      }

      // d. Create Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'SCHEDULE',
          entityId: run.id,
          action: 'UPDATE',
          description: `Optimization run completed: ${result.changes.length} assignment(s) improved. Quality score changed from ${result.baselineMetrics.qualityScore} to ${result.optimizedMetrics.qualityScore} (+${result.comparison.scoreImprovement}).`,
          newValue: JSON.stringify({
            runId: run.id,
            comparison: result.comparison,
            changesCount: result.changes.length,
          }),
        },
      });

      // e. Cache Idempotency Record if key was provided
      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            idempotencyKey,
            operationType: 'OPTIMIZE_SCHEDULE',
            responseStatus: 200,
            responseBody: JSON.stringify(result),
          },
        });
      }
    });

    return result;
  }

  /**
   * Retrieves paginated list of historical optimization runs.
   */
  async getOptimizationRuns(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;
    const [total, runs] = await Promise.all([
      prisma.schedulingRun.count({ where: { runType: 'OPTIMIZATION' } }),
      prisma.schedulingRun.findMany({
        where: { runType: 'OPTIMIZATION' },
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
   * Retrieves an optimization run by UUID with all assignment audit details.
   */
  async getOptimizationRunById(id: string) {
    const run = await prisma.schedulingRun.findFirst({
      where: { id, runType: 'OPTIMIZATION' },
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
      throw new AppError(`Optimization run with ID "${id}" not found.`, 404, 'RUN_NOT_FOUND');
    }

    return run;
  }

  /**
   * Retrieves the before-and-after metrics comparison for a completed optimization run.
   */
  async getOptimizationComparison(id: string) {
    await this.getOptimizationRunById(id); // Ensure run exists

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'SCHEDULE',
        entityId: id,
        action: 'UPDATE',
      },
    });

    let comparisonData = null;
    if (audit?.newValue) {
      try {
        const parsed = JSON.parse(audit.newValue);
        comparisonData = parsed.comparison || null;
      } catch {
        comparisonData = null;
      }
    }

    return {
      runId: id,
      comparison: comparisonData,
    };
  }

  /**
   * Retrieves the list of assignment modifications made in a specific optimization run.
   */
  async getOptimizationChanges(id: string) {
    const run = await this.getOptimizationRunById(id);
    const changedDetails = run.details.filter((d) => d.assignmentStatus === 'REASSIGNED');

    return {
      runId: id,
      totalChanges: changedDetails.length,
      changes: changedDetails.map((d) => ({
        jobId: d.jobId,
        customerName: d.job?.customerName,
        previousTechnician: d.previousTechnician?.name,
        newTechnician: d.selectedTechnician?.name,
        scheduledStart: d.scheduledStart,
        scheduledEnd: d.scheduledEnd,
        reason: d.explanation,
        impact: d.rejectionReasons ? JSON.parse(d.rejectionReasons) : null,
      })),
    };
  }

  private async loadScheduleData() {
    const assignments = await prisma.assignment.findMany({
      where: {
        status: { in: ['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'] },
      },
      include: {
        job: true,
        technician: true,
      },
      orderBy: { scheduledStart: 'asc' },
    });

    if (assignments.length === 0) {
      throw new AppError(
        'No active assignments found in database to optimize. Generate a schedule first.',
        400,
        'NO_ACTIVE_SCHEDULE'
      );
    }

    const technicians = await prisma.technician.findMany({
      include: {
        unavailabilities: true,
      },
    });

    const jobs = await prisma.job.findMany();

    return { assignments, jobs, technicians };
  }
}

export const optimizationService = new OptimizationService();
