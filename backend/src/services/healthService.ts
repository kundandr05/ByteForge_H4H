import { prisma } from '../config/prisma';
import { config } from '../config';
import { HealthCheckData } from '../types';
import { logger } from '../utils/logger';
import { AppError } from '../utils/appError';

export interface DatabaseHealthData {
  status: 'connected' | 'error';
  provider: string;
  latencyMs: number;
  databaseUrl: string;
  tableCounts: {
    technicians: number;
    jobs: number;
    assignments: number;
    schedulingRuns: number;
    schedulingRunDetails: number;
    disruptionEvents: number;
    unavailabilities: number;
    auditLogs: number;
    idempotencyRecords: number;
  };
  timestamp: string;
}

export class HealthService {
  /**
   * Performs basic system health check verifying Express and Node runtime.
   */
  public async getHealth(): Promise<HealthCheckData> {
    let dbConnected = false;
    let latencyMs: number | undefined;

    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      latencyMs = Date.now() - start;
      dbConnected = true;
    } catch (error) {
      logger.warn('Health check: Database probe failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      dbConnected = false;
    }

    const mem = process.memoryUsage();

    return {
      status: dbConnected ? 'ok' : 'degraded',
      service: 'dispatchgrid-backend',
      version: '0.2.0',
      environment: config.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        connected: dbConnected,
        provider: 'sqlite',
        latencyMs,
      },
      system: {
        nodeVersion: process.version,
        memoryUsageMB: {
          rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
          heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
          heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        },
      },
    };
  }

  /**
   * Performs dedicated database connectivity, latency, and entity statistics probe.
   */
  public async getDatabaseHealth(): Promise<DatabaseHealthData> {
    const start = Date.now();
    try {
      // Execute raw query probe
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;

      // Query table counts in parallel
      const [
        technicians,
        jobs,
        assignments,
        schedulingRuns,
        schedulingRunDetails,
        disruptionEvents,
        unavailabilities,
        auditLogs,
        idempotencyRecords,
      ] = await Promise.all([
        prisma.technician.count(),
        prisma.job.count(),
        prisma.assignment.count(),
        prisma.schedulingRun.count(),
        prisma.schedulingRunDetail.count(),
        prisma.disruptionEvent.count(),
        prisma.technicianUnavailability.count(),
        prisma.auditLog.count(),
        prisma.idempotencyRecord.count(),
      ]);

      return {
        status: 'connected',
        provider: 'sqlite',
        latencyMs,
        databaseUrl: config.DATABASE_URL.replace(/(\/\/.*:).*@/, '$1***@'), // Redact secrets if any
        tableCounts: {
          technicians,
          jobs,
          assignments,
          schedulingRuns,
          schedulingRunDetails,
          disruptionEvents,
          unavailabilities,
          auditLogs,
          idempotencyRecords,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Database health probe failed:', error);
      throw new AppError(
        'Database connection failed or database is not responding',
        503,
        'DATABASE_UNAVAILABLE',
        {
          provider: 'sqlite',
          reason: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }
}

export const healthService = new HealthService();
export default healthService;
