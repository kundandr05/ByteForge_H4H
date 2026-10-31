import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/prisma';

// Ensure test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db';

beforeAll(async () => {
  // Clear test tables to ensure clean state before test runs
  try {
    await prisma.schedulingRunDetail.deleteMany({});
    await prisma.schedulingRun.deleteMany({});
    await prisma.assignment.deleteMany({});
    await prisma.technicianUnavailability.deleteMany({});
    await prisma.disruptionEvent.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.technician.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.idempotencyRecord.deleteMany({});
  } catch (error) {
    // If tables are not yet populated, proceed cleanly
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
