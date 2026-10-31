import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

// Prevent multiple instances of Prisma Client in development / HMR
export const prisma =
  global.prismaGlobal ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

/**
 * Validates database connectivity by issuing a test probe.
 */
export async function checkDatabaseConnection(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Prisma connection probe failed', { error: errorMsg });
    return {
      connected: false,
      error: errorMsg,
    };
  }
}

/**
 * Disconnects Prisma client cleanly during application shutdown.
 */
export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Prisma disconnected successfully.');
  } catch (error) {
    logger.error('Error disconnecting Prisma client', error);
  }
}

export default prisma;
