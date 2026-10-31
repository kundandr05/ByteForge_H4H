import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { transactionService } from './transaction.service';

export interface ConcurrencyMetrics {
  activeOperations: number;
  totalTransactionsExecuted: number;
  retriedTransactionsCount: number;
  failedTransactionsCount: number;
  sqliteBusyEventsCount: number;
}

class ReliabilityService {
  private activeLocks = new Set<string>();
  private metrics: ConcurrencyMetrics = {
    activeOperations: 0,
    totalTransactionsExecuted: 0,
    retriedTransactionsCount: 0,
    failedTransactionsCount: 0,
    sqliteBusyEventsCount: 0,
  };

  /**
   * Acquires a cooperative lock on an operation key (e.g. scheduling run or technician ID)
   * to prevent duplicate overlapping background tasks in high-concurrency environments.
   */
  public acquireLock(lockKey: string): boolean {
    if (this.activeLocks.has(lockKey)) {
      return false; // Lock already held
    }
    this.activeLocks.add(lockKey);
    this.metrics.activeOperations++;
    return true;
  }

  /**
   * Releases an operation lock.
   */
  public releaseLock(lockKey: string): void {
    if (this.activeLocks.delete(lockKey)) {
      this.metrics.activeOperations = Math.max(0, this.metrics.activeOperations - 1);
    }
  }

  /**
   * Executes a critical operation protected by an in-memory lock.
   * If lock cannot be acquired, throws concurrency error.
   */
  public async withLock<T>(
    lockKey: string,
    operation: () => Promise<T>,
    errorMessage = 'Operation already in progress for this resource'
  ): Promise<T> {
    const acquired = this.acquireLock(lockKey);
    if (!acquired) {
      throw new Error(`CONCURRENCY_CONFLICT: ${errorMessage} [${lockKey}]`);
    }

    try {
      return await operation();
    } finally {
      this.releaseLock(lockKey);
    }
  }

  /**
   * Checks database integrity and table counts.
   */
  public async getHealthMetrics() {
    const [jobs, technicians, assignments, runs, audits, idempotencies] = await Promise.all([
      prisma.job.count(),
      prisma.technician.count(),
      prisma.assignment.count(),
      prisma.schedulingRun.count(),
      prisma.auditLog.count(),
      prisma.idempotencyRecord.count(),
    ]);

    return {
      database: {
        status: 'UP',
        engine: 'SQLite (WAL Mode Recommended)',
        recordCounts: {
          jobs,
          technicians,
          assignments,
          schedulingRuns: runs,
          auditLogs: audits,
          idempotencyRecords: idempotencies,
        },
      },
      concurrency: {
        ...this.metrics,
        activeLocks: Array.from(this.activeLocks),
      },
    };
  }

  /**
   * Resets metrics (useful for testing suites).
   */
  public resetMetrics(): void {
    this.activeLocks.clear();
    this.metrics = {
      activeOperations: 0,
      totalTransactionsExecuted: 0,
      retriedTransactionsCount: 0,
      failedTransactionsCount: 0,
      sqliteBusyEventsCount: 0,
    };
  }
}

export const reliabilityService = new ReliabilityService();
