import { app } from './app';
import { config } from './config';
import { prisma } from './config/prisma';
import { logger } from './utils/logger';
import { autoDispatchService } from './services/autoDispatch.service';

const server = app.listen(config.PORT, () => {
  logger.info(`DispatchGrid Backend listening on port ${config.PORT}`);
  logger.info(`Environment: ${config.NODE_ENV}`);
  logger.info(`Health check: http://localhost:${config.PORT}/api/health`);

  // Autonomous Scheduling: Automatically assign any unassigned jobs on startup
  autoDispatchService
    .autoScheduleAllUnassigned({ referenceDate: '2026-11-02' })
    .then((res) => {
      if (res.scheduledCount > 0) {
        logger.info(`[AutonomousDispatch] Startup auto-scheduled ${res.scheduledCount} unassigned jobs.`);
      }
    })
    .catch((err) => {
      logger.warn('[AutonomousDispatch] Startup auto-schedule notice:', err?.message || err);
    });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await prisma.$disconnect();
      logger.info('Database disconnected.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during database disconnect', err);
      process.exit(1);
    }
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;
