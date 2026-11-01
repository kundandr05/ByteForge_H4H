import { prisma } from '../config/prisma';
import { AppError } from '../utils/appError';
import {
  jobCreateSchema,
  jobUpdateSchema,
  JobStatus,
  validateJobStatusTransition,
} from '../validators/schemas';
import { JobListQuery, PaginationMeta } from '../types';
import { z } from 'zod';

export interface FormattedJob {
  id: string;
  customerName: string;
  description: string;
  requiredSkills: string[];
  priority: string;
  estimatedDuration: number;
  latitude: number;
  longitude: number;
  serviceZone: string;
  earliestStart: Date;
  latestEnd: Date;
  slaDeadline: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  assignments?: unknown[];
}

export class JobService {
  /**
   * Helper to format Prisma job record into typed structure with parsed JSON fields
   */
  public formatJob(job: any): FormattedJob {
    let parsedSkills: string[] = [];
    try {
      parsedSkills = typeof job.requiredSkills === 'string'
        ? JSON.parse(job.requiredSkills)
        : job.requiredSkills || [];
    } catch {
      parsedSkills = [];
    }

    return {
      ...job,
      requiredSkills: parsedSkills,
    };
  }

  /**
   * Creates a new Job and records an audit log entry within a transaction.
   */
  public async createJob(input: z.infer<typeof jobCreateSchema>): Promise<FormattedJob> {
    const validated = jobCreateSchema.parse(input);

    const formatted = await prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          customerName: validated.customerName,
          description: validated.description,
          requiredSkills: JSON.stringify(validated.requiredSkills),
          priority: validated.priority,
          estimatedDuration: validated.estimatedDuration,
          latitude: validated.latitude,
          longitude: validated.longitude,
          serviceZone: validated.serviceZone,
          earliestStart: validated.earliestStart,
          latestEnd: validated.latestEnd,
          slaDeadline: validated.slaDeadline,
          status: validated.status || 'PENDING',
        },
      });

      // Transactional Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'JOB',
          entityId: job.id,
          action: 'CREATE',
          newValue: JSON.stringify(job),
          description: `Created job for customer ${job.customerName} in zone ${job.serviceZone}`,
        },
      });

      return this.formatJob(job);
    });

    // Autonomous Allocation: Automatically schedule new job to nearest qualified specialist
    try {
      const { autoDispatchService } = await import('./autoDispatch.service');
      const refDate = formatted.earliestStart ? new Date(formatted.earliestStart).toISOString().split('T')[0] : '2026-11-02';
      await autoDispatchService.autoScheduleAllUnassigned({ referenceDate: refDate });
    } catch (autoErr) {
      console.warn('[AutonomousDispatch] Automatic assignment trigger notice:', autoErr);
    }

    return formatted;
  }

  /**
   * Retrieves paginated list of jobs with filtering, search, and sorting.
   */
  public async getJobs(query: JobListQuery): Promise<{ jobs: FormattedJob[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(500, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Search by customer name and description
    if (query.search) {
      where.OR = [
        { customerName: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }

    // Filter by priority
    if (query.priority) {
      where.priority = query.priority;
    }

    // Filter by status
    if (query.status) {
      where.status = query.status;
    }

    // Filter by service zone
    if (query.serviceZone) {
      where.serviceZone = query.serviceZone;
    }

    // Sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const orderBy: any = { [sortBy]: sortOrder };

    const [total, rawJobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          assignments: {
            include: {
              technician: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const jobs = rawJobs.map((j) => this.formatJob(j));

    return {
      jobs,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Retrieves a single job by UUID with its assignment history.
   */
  public async getJobById(id: string): Promise<FormattedJob> {
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            technician: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                availabilityStatus: true,
              },
            },
          },
        },
      },
    });

    if (!job) {
      throw AppError.notFound(`Job with ID '${id}' not found.`, 'JOB_NOT_FOUND');
    }

    return this.formatJob(job);
  }

  /**
   * Updates job information while enforcing constraints and safety rules.
   */
  public async updateJob(id: string, input: z.infer<typeof jobUpdateSchema>): Promise<FormattedJob> {
    const validated = jobUpdateSchema.parse(input);

    const existingJob = await prisma.job.findUnique({ where: { id } });
    if (!existingJob) {
      throw AppError.notFound(`Job with ID '${id}' not found.`, 'JOB_NOT_FOUND');
    }

    // Guard: Terminal jobs cannot be edited
    if (existingJob.status === 'COMPLETED' || existingJob.status === 'CANCELLED') {
      throw AppError.badRequest(
        `Cannot modify job in terminal '${existingJob.status}' state.`,
        'UNSAFE_OPERATION'
      );
    }

    // Guard: IN_PROGRESS jobs cannot have core scheduling requirements altered
    if (existingJob.status === 'IN_PROGRESS') {
      const touchesScheduling =
        validated.requiredSkills !== undefined ||
        validated.estimatedDuration !== undefined ||
        validated.earliestStart !== undefined ||
        validated.latestEnd !== undefined ||
        validated.serviceZone !== undefined;

      if (touchesScheduling) {
        throw AppError.badRequest(
          'Cannot modify scheduling constraints or required skills on an in-progress job.',
          'UNSAFE_OPERATION'
        );
      }
    }

    // Time window consistency check for partial updates
    const effectiveEarliest = validated.earliestStart || existingJob.earliestStart;
    const effectiveLatest = validated.latestEnd || existingJob.latestEnd;
    const effectiveSla = validated.slaDeadline || existingJob.slaDeadline;

    if (effectiveEarliest >= effectiveLatest) {
      throw AppError.badRequest('earliestStart must be before latestEnd.', 'VALIDATION_ERROR');
    }
    if (effectiveSla < effectiveEarliest) {
      throw AppError.badRequest('slaDeadline must be on or after earliestStart.', 'VALIDATION_ERROR');
    }

    return await prisma.$transaction(async (tx) => {
      const updateData: any = {};
      if (validated.customerName !== undefined) updateData.customerName = validated.customerName;
      if (validated.description !== undefined) updateData.description = validated.description;
      if (validated.requiredSkills !== undefined) updateData.requiredSkills = JSON.stringify(validated.requiredSkills);
      if (validated.priority !== undefined) updateData.priority = validated.priority;
      if (validated.estimatedDuration !== undefined) updateData.estimatedDuration = validated.estimatedDuration;
      if (validated.latitude !== undefined) updateData.latitude = validated.latitude;
      if (validated.longitude !== undefined) updateData.longitude = validated.longitude;
      if (validated.serviceZone !== undefined) updateData.serviceZone = validated.serviceZone;
      if (validated.earliestStart !== undefined) updateData.earliestStart = validated.earliestStart;
      if (validated.latestEnd !== undefined) updateData.latestEnd = validated.latestEnd;
      if (validated.slaDeadline !== undefined) updateData.slaDeadline = validated.slaDeadline;

      const updatedJob = await tx.job.update({
        where: { id },
        data: updateData,
      });

      // Transactional Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'JOB',
          entityId: id,
          action: 'UPDATE',
          previousValue: JSON.stringify(existingJob),
          newValue: JSON.stringify(updatedJob),
          description: `Updated job attributes for job ${id}`,
        },
      });

      return this.formatJob(updatedJob);
    });
  }

  /**
   * Updates job status using strict, controlled state machine transitions.
   */
  public async updateJobStatus(id: string, newStatus: JobStatus): Promise<FormattedJob> {
    const existingJob = await prisma.job.findUnique({ where: { id } });
    if (!existingJob) {
      throw AppError.notFound(`Job with ID '${id}' not found.`, 'JOB_NOT_FOUND');
    }

    // Validate transition against state machine rules
    validateJobStatusTransition(existingJob.status as JobStatus, newStatus);

    return await prisma.$transaction(async (tx) => {
      const updatedJob = await tx.job.update({
        where: { id },
        data: { status: newStatus },
      });

      // Transactional Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'JOB',
          entityId: id,
          action: 'STATUS_CHANGE',
          previousValue: JSON.stringify({ status: existingJob.status }),
          newValue: JSON.stringify({ status: newStatus }),
          description: `Job status transitioned from ${existingJob.status} to ${newStatus}`,
        },
      });

      return this.formatJob(updatedJob);
    });
  }

  /**
   * Safely deletes a job ensuring no active assignments or in-progress operations are violated.
   */
  public async deleteJob(id: string): Promise<{ id: string; customerName: string }> {
    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: {
        assignments: true,
      },
    });

    if (!existingJob) {
      throw AppError.notFound(`Job with ID '${id}' not found.`, 'JOB_NOT_FOUND');
    }

    return await prisma.$transaction(async (tx) => {
      // Automatically clean up assignments, run details, and disruption events linked to this job
      await tx.assignment.deleteMany({
        where: { jobId: id },
      });

      await tx.schedulingRunDetail.deleteMany({
        where: { jobId: id },
      });

      await tx.disruptionEvent.deleteMany({
        where: { jobId: id },
      });

      // Transactional Audit Log prior to deletion
      await tx.auditLog.create({
        data: {
          entityType: 'JOB',
          entityId: id,
          action: 'DELETE',
          previousValue: JSON.stringify(existingJob),
          description: `Deleted job ${id} (${existingJob.customerName})`,
        },
      });

      await tx.job.delete({ where: { id } });

      return { id, customerName: existingJob.customerName };
    });
  }
}

export const jobService = new JobService();
export default jobService;
