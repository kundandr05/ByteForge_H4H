import { autoDispatchService } from '../src/services/autoDispatch.service';
import { prisma } from '../src/config/prisma';

async function main() {
  console.log('Executing Autonomous Auto-Scheduling on all unassigned jobs...');
  const res = await autoDispatchService.autoScheduleAllUnassigned({ referenceDate: '2026-11-02' });
  console.log(`✓ Result: ${res.message} (Scheduled ${res.scheduledCount} jobs)`);
  const remaining = await prisma.job.count({ where: { status: { in: ['PENDING', 'UNASSIGNED'] } } });
  console.log(`Remaining unassigned jobs: ${remaining}`);
  await prisma.$disconnect();
}

main().catch(console.error);

