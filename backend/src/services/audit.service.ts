import { Prisma, AuditLog } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/appError';
import { logger } from '../utils/logger';

export type AuditEntityType =
  | 'JOB'
  | 'TECHNICIAN'
  | 'ASSIGNMENT'
  | 'SCHEDULE'
  | 'OPTIMIZATION'
  | 'DISRUPTION'
  | 'RECOVERY'
  | 'SYSTEM';

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'STATUS_CHANGE'
  | 'AVAILABILITY_CHANGE'
  | 'ASSIGN'
  | 'REASSIGN'
  | 'CANCEL'
  | 'SCHEDULE_RUN'
  | 'OPTIMIZE_RUN'
  | 'DISRUPT'
  | 'RECOVER';

export interface CreateAuditEntryInput {
  entityType: AuditEntityType | string;
  entityId: string;
  action: AuditActionType | string;
  previousValue?: any;
  newValue?: any;
  description?: string;
  schedulingRunId?: string;
  disruptionEventId?: string;
  actorId?: string;
}

export interface AuditFilterParams {
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
  action?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  sortBy?: 'createdAt' | 'entityType' | 'action';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedAuditResult {
  items: AuditLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

class AuditService {
  /**
   * Creates an audit log record atomically.
   * Accepts an optional Prisma transaction client to guarantee that
   * the operational change and its audit entry commit together.
   */
  public async log(
    entry: CreateAuditEntryInput,
    tx?: Prisma.TransactionClient
  ): Promise<AuditLog> {
    const client = tx || prisma;

    // Format snapshot payloads safely
    let prevValStr: string | null = null;
    if (entry.previousValue !== undefined && entry.previousValue !== null) {
      prevValStr =
        typeof entry.previousValue === 'string'
          ? entry.previousValue
          : JSON.stringify(entry.previousValue);
    }

    let newValStr: string | null = null;
    if (entry.newValue !== undefined && entry.newValue !== null) {
      let valToSerialize = entry.newValue;
      // If metadata IDs are provided, ensure they are embedded in newValue object
      if (
        (entry.schedulingRunId || entry.disruptionEventId || entry.actorId) &&
        typeof entry.newValue === 'object' &&
        !Array.isArray(entry.newValue)
      ) {
        valToSerialize = {
          ...entry.newValue,
          ...(entry.schedulingRunId ? { schedulingRunId: entry.schedulingRunId } : {}),
          ...(entry.disruptionEventId ? { disruptionEventId: entry.disruptionEventId } : {}),
          ...(entry.actorId ? { actorId: entry.actorId } : {}),
        };
      }
      newValStr =
        typeof valToSerialize === 'string'
          ? valToSerialize
          : JSON.stringify(valToSerialize);
    }

    // Deduplication check: prevent duplicate audit records within short window
    if (!tx) {
      const recentDuplicate = await prisma.auditLog.findFirst({
        where: {
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          createdAt: {
            gte: new Date(Date.now() - 1000), // Within last 1 second
          },
        },
      });

      if (
        recentDuplicate &&
        recentDuplicate.previousValue === prevValStr &&
        recentDuplicate.newValue === newValStr
      ) {
        logger.debug(
          `[AUDIT:DEDUPLICATE] Suppressed duplicate audit log for ${entry.entityType}:${entry.entityId} action=${entry.action}`
        );
        return recentDuplicate;
      }
    }

    const audit = await client.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        previousValue: prevValStr,
        newValue: newValStr,
        description: entry.description || `${entry.action} on ${entry.entityType} ${entry.entityId}`,
      },
    });

    return audit;
  }

  /**
   * Queries audit logs with pagination, filtering, and sorting.
   */
  public async query(params: AuditFilterParams = {}): Promise<PaginatedAuditResult> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (params.entityType) {
      where.entityType = {
        equals: params.entityType.toUpperCase(),
      };
    }

    if (params.entityId) {
      where.entityId = {
        equals: params.entityId,
      };
    }

    if (params.action) {
      where.action = {
        equals: params.action.toUpperCase(),
      };
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.createdAt.lte = new Date(params.endDate);
      }
    }

    const sortBy = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder || 'desc';

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves an individual audit log by ID.
   */
  public async getById(id: string): Promise<AuditLog> {
    const audit = await prisma.auditLog.findUnique({
      where: { id },
    });

    if (!audit) {
      throw new AppError(`Audit log with ID '${id}' not found`, 404, 'AUDIT_NOT_FOUND');
    }

    return audit;
  }

  /**
   * Retrieves all audit entries for a specific entity.
   */
  public async getByEntity(
    entityType: string,
    entityId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<PaginatedAuditResult> {
    return this.query({
      ...params,
      entityType,
      entityId,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }

  /**
   * Immutability safeguard: Normal APIs MUST NOT update audit records.
   */
  public async update(): Promise<never> {
    throw new AppError(
      'AUDIT_RECORD_IMMUTABLE: Audit records are strictly immutable and cannot be updated',
      403,
      'AUDIT_RECORD_IMMUTABLE'
    );
  }

  /**
   * Immutability safeguard: Normal APIs MUST NOT delete audit records.
   */
  public async delete(): Promise<never> {
    throw new AppError(
      'AUDIT_RECORD_IMMUTABLE: Audit records are strictly immutable and cannot be deleted',
      403,
      'AUDIT_RECORD_IMMUTABLE'
    );
  }
}

export const auditService = new AuditService();
