import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { eventLoggerService } from './event-logger.service';

export interface TransactionOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  operationName?: string;
  requestId?: string;
}

const DEFAULT_TRANSACTION_OPTIONS: Required<TransactionOptions> = {
  maxRetries: 4,
  baseDelayMs: 40,
  maxDelayMs: 600,
  timeoutMs: 15000,
  operationName: 'TRANSACTION',
  requestId: 'SYSTEM',
};

/**
 * Checks whether an error is a transient SQLite locking or busy error
 * that can be safely recovered by retrying.
 */
export function isRetryableSqliteError(error: any): boolean {
  if (!error) return false;

  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '').toUpperCase();

  // SQLite specific error codes and messages
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
    return true;
  }

  // Prisma Transaction Conflict error codes
  // P2034: Transaction failed due to a write conflict or a deadlock.
  // P2028: Transaction already closed / timeout
  // P1008: Operations timed out waiting for database lock
  if (code === 'P2034' || code === 'P2028' || code === 'P1008') {
    return true;
  }

  if (
    msg.includes('sqlite_busy') ||
    msg.includes('database is locked') ||
    msg.includes('timed out waiting for transaction') ||
    msg.includes('write conflict') ||
    msg.includes('deadlock')
  ) {
    return true;
  }

  return false;
}

class TransactionService {
  /**
   * Executes a database transaction with automated exponential backoff and jitter
   * specifically tuned for SQLite concurrency and lock contention.
   *
   * If any step fails, all operations within the transaction client (tx)
   * are completely rolled back by Prisma, guaranteeing atomic consistency.
   */
  public async executeWithRetry<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const opts = { ...DEFAULT_TRANSACTION_OPTIONS, ...options };
    let attempt = 0;
    const startTime = Date.now();

    while (true) {
      attempt++;
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            return await fn(tx);
          },
          {
            timeout: opts.timeoutMs,
            maxWait: 5000,
          }
        );

        if (attempt > 1) {
          logger.info(
            `[TRANSACTION:RECOVERED] ${opts.operationName} succeeded on retry attempt ${attempt} (${Date.now() - startTime}ms)`
          );
        }

        return result;
      } catch (error: any) {
        const isRetryable = isRetryableSqliteError(error);

        if (isRetryable && attempt <= opts.maxRetries) {
          // Exponential backoff with random jitter to avoid thundering herd on SQLite single-writer lock
          const exponentialDelay = opts.baseDelayMs * Math.pow(2, attempt - 1);
          const jitter = Math.random() * (exponentialDelay * 0.5);
          const delay = Math.min(opts.maxDelayMs, Math.round(exponentialDelay + jitter));

          logger.warn(
            `[TRANSACTION:LOCK_CONTENTION] ${opts.operationName} encountered SQLite lock (attempt ${attempt}/${opts.maxRetries}). Retrying in ${delay}ms... Details: ${error?.message}`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Non-retryable error or exhausted retries -> Log structured operational failure and rethrow
        eventLoggerService.logOperation({
          requestId: opts.requestId,
          operationName: opts.operationName,
          executionDurationMs: Date.now() - startTime,
          status: 'FAILURE',
          errorCode: error?.code || 'TRANSACTION_ROLLBACK',
          metadata: {
            attempts: attempt,
            isRetryable,
            error: error?.message || String(error),
          },
        });

        throw error;
      }
    }
  }
}

export const transactionService = new TransactionService();
