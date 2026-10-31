import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

export type EventStatus = 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS';

export interface StructuredEventLog {
  id: string;
  requestId: string;
  operationName: string;
  entityId?: string | null;
  schedulingRunId?: string | null;
  disruptionEventId?: string | null;
  executionDurationMs: number;
  status: EventStatus;
  errorCode?: string | null;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface LogOperationParams {
  requestId?: string;
  operationName: string;
  entityId?: string | null;
  schedulingRunId?: string | null;
  disruptionEventId?: string | null;
  executionDurationMs: number;
  status: EventStatus;
  errorCode?: string | null;
  metadata?: Record<string, any>;
}

class EventLoggerService {
  private static readonly MAX_BUFFER_SIZE = 1000;
  private readonly buffer: StructuredEventLog[] = [];

  /**
   * Records a structured operational event.
   * Keeps operational logs separate from persistent compliance audit history.
   */
  public logOperation(params: LogOperationParams): StructuredEventLog {
    const event: StructuredEventLog = {
      id: randomUUID(),
      requestId: params.requestId || randomUUID(),
      operationName: params.operationName,
      entityId: params.entityId || null,
      schedulingRunId: params.schedulingRunId || null,
      disruptionEventId: params.disruptionEventId || null,
      executionDurationMs: Math.max(0, Math.round(params.executionDurationMs)),
      status: params.status,
      errorCode: params.errorCode || null,
      timestamp: new Date().toISOString(),
      metadata: params.metadata ? this.sanitizeMetadata(params.metadata) : undefined,
    };

    // Store in circular buffer
    this.buffer.push(event);
    if (this.buffer.length > EventLoggerService.MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }

    // Output formatted structured console message
    const logMsg = `[OPERATION:${event.operationName}] [REQ:${event.requestId.substring(0, 8)}] status=${event.status} duration=${event.executionDurationMs}ms${
      event.entityId ? ` entity=${event.entityId}` : ''
    }${event.schedulingRunId ? ` run=${event.schedulingRunId}` : ''}${
      event.errorCode ? ` errorCode=${event.errorCode}` : ''
    }`;

    if (event.status === 'FAILURE') {
      logger.error(logMsg, event.metadata);
    } else {
      logger.info(logMsg, event.metadata);
    }

    return event;
  }

  /**
   * Helper to execute a timed operation and automatically log its result.
   */
  public async trackOperation<T>(
    operationName: string,
    operationFn: (requestId: string) => Promise<T>,
    context?: {
      requestId?: string;
      entityId?: string;
      schedulingRunId?: string;
      disruptionEventId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<T> {
    const requestId = context?.requestId || randomUUID();
    const startTime = Date.now();

    try {
      const result = await operationFn(requestId);
      const duration = Date.now() - startTime;

      this.logOperation({
        requestId,
        operationName,
        entityId: context?.entityId,
        schedulingRunId: context?.schedulingRunId,
        disruptionEventId: context?.disruptionEventId,
        executionDurationMs: duration,
        status: 'SUCCESS',
        metadata: context?.metadata,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.logOperation({
        requestId,
        operationName,
        entityId: context?.entityId,
        schedulingRunId: context?.schedulingRunId,
        disruptionEventId: context?.disruptionEventId,
        executionDurationMs: duration,
        status: 'FAILURE',
        errorCode: error?.code || error?.name || 'UNKNOWN_ERROR',
        metadata: {
          errorMessage: error?.message || String(error),
          ...(context?.metadata || {}),
        },
      });

      throw error;
    }
  }

  /**
   * Retrieve in-memory operational event logs with optional filtering.
   */
  public getRecentLogs(filters?: {
    operationName?: string;
    status?: EventStatus;
    requestId?: string;
    limit?: number;
  }): StructuredEventLog[] {
    let result = [...this.buffer].reverse();

    if (filters?.operationName) {
      result = result.filter((l) => l.operationName.toLowerCase() === filters.operationName!.toLowerCase());
    }
    if (filters?.status) {
      result = result.filter((l) => l.status === filters.status);
    }
    if (filters?.requestId) {
      result = result.filter((l) => l.requestId === filters.requestId);
    }

    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 100;
    return result.slice(0, limit);
  }

  /**
   * Clears internal buffer (primarily for test resets).
   */
  public clearBuffer(): void {
    this.buffer.length = 0;
  }

  /**
   * Redacts any potentially sensitive fields from metadata logs.
   */
  private sanitizeMetadata(data: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['password', 'token', 'authorization', 'secret', 'apikey', 'creditcard'];
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

export const eventLoggerService = new EventLoggerService();

/**
 * Express middleware for request correlation and structured operational logging.
 */
export const requestCorrelationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingReqId = req.headers['x-request-id'] as string;
  const requestId = incomingReqId || randomUUID();

  // Attach requestId to request and response header
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const isError = res.statusCode >= 400;

    eventLoggerService.logOperation({
      requestId,
      operationName: `HTTP_${req.method}_${req.baseUrl || req.path}`,
      executionDurationMs: duration,
      status: isError ? 'FAILURE' : 'SUCCESS',
      errorCode: isError ? `HTTP_${res.statusCode}` : undefined,
      metadata: {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
      },
    });
  });

  next();
};
