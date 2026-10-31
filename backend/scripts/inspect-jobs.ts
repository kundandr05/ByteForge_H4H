import { prisma } from '../src/config/prisma';

async function main() {
  const jobs = await prisma.job.findMany({
    select: { id: true, status: true, customerName: true },
  });
  console.log(`Total jobs: ${jobs.length}`);
  const statusCounts: Record<string, number> = {};
  for (const j of jobs) {
    statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
  }
  console.log('Status counts:', statusCounts);

  const assignments = await prisma.assignment.count();
  console.log(`Total assignments: ${assignments}`);
  await prisma.$disconnect();
}

main().catch(console.error);

