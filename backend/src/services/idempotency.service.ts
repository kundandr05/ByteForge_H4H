import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/appError';
import { logger } from '../utils/logger';

export interface CachedResponse<T = any> {
  status: number;
  body: T;
  cachedAt: Date;
}

class IdempotencyService {
  private inFlightKeys = new Set<string>();

  /**
   * Validates idempotency key format.
   */
  public validateKey(key?: string): string | null {
    if (!key) return null;
    const trimmed = key.trim();
    if (trimmed.length === 0) {
      throw new AppError('Idempotency key cannot be empty', 400, 'INVALID_IDEMPOTENCY_KEY');
    }
    if (trimmed.length > 255) {
      throw new AppError('Idempotency key exceeds maximum length of 255 characters', 400, 'INVALID_IDEMPOTENCY_KEY');
    }
    return trimmed;
  }

  /**
   * Retrieves an existing cached response for an idempotency key.
   */
  public async getCachedResponse<T = any>(
    key: string,
    operationType?: string
  ): Promise<CachedResponse<T> | null> {
    const record = await prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: key },
    });

    if (!record) {
      return null;
    }

    if (operationType && record.operationType !== operationType) {
      throw new AppError(
        `Idempotency key '${key}' was previously used for a different operation type '${record.operationType}'`,
        409,
        'IDEMPOTENCY_KEY_MISMATCH'
      );
    }

    let parsedBody: T;
    try {
      parsedBody = JSON.parse(record.responseBody) as T;
    } catch {
      parsedBody = record.responseBody as unknown as T;
    }

    return {
      status: record.responseStatus,
      body: parsedBody,
      cachedAt: record.createdAt,
    };
  }

  /**
   * Records the successful completion and cached response of an idempotent operation.
   * Can be executed inside an active Prisma transaction to guarantee atomicity.
   */
  public async recordResponse(
    key: string,
    operationType: string,
    status: number,
    body: any,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx || prisma;
    const serializedBody = typeof body === 'string' ? body : JSON.stringify(body);

    await client.idempotencyRecord.create({
      data: {
        idempotencyKey: key,
        operationType,
        responseStatus: status,
        responseBody: serializedBody,
      },
    });

    // Remove from in-flight tracker
    this.inFlightKeys.delete(key);
  }

  /**
   * Claims an idempotency key before execution starts.
   * Throws 409 Conflict if another worker/thread is currently processing this exact key.
   */
  public claimKey(key: string): void {
    if (this.inFlightKeys.has(key)) {
      throw new AppError(
        `An operation with idempotency key '${key}' is currently being processed. Please retry shortly.`,
        409,
        'CONCURRENT_IDEMPOTENT_REQUEST'
      );
    }
    this.inFlightKeys.add(key);
  }

  /**
   * Releases an in-flight claim (e.g. if an error happened before completion).
   */
  public releaseKey(key: string): void {
    this.inFlightKeys.delete(key);
  }

  /**
   * Higher-order wrapper to execute any operation idempotently.
   */
  public async executeIdempotent<T>(
    key: string | undefined,
    operationType: string,
    executor: () => Promise<{ status: number; body: T }>
  ): Promise<{ status: number; body: T; isCached: boolean }> {
    const validKey = this.validateKey(key);

    if (!validKey) {
      const result = await executor();
      return { ...result, isCached: false };
    }

    // 1. Check database for existing completed execution
    const cached = await this.getCachedResponse<T>(validKey, operationType);
    if (cached) {
      logger.info(`[IDEMPOTENCY:CACHE_HIT] Key '${validKey}' returned cached response (${cached.status})`);
      return {
        status: cached.status,
        body: cached.body,
        isCached: true,
      };
    }

    // 2. Claim lock to prevent concurrent identical requests
    this.claimKey(validKey);

    try {
      const result = await executor();

      // 3. Atomically cache the response
      await this.recordResponse(validKey, operationType, result.status, result.body);

      return {
        status: result.status,
        body: result.body,
        isCached: false,
      };
    } catch (err) {
      this.releaseKey(validKey);
      throw err;
    }
  }
}

export const idempotencyService = new IdempotencyService();
