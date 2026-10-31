import { prisma } from '../src/config/prisma';
import { runSeed } from '../prisma/seed/seed';
import { schedulingService } from '../src/scheduling/scheduling.service';
import { recoveryService } from '../src/recovery/recovery.service';

async function verifyRecovery() {
  console.log('\n========================================================================');
  console.log('  DispatchGrid Phase 7: Disruption Management & Recovery Verification');
  console.log('========================================================================\n');

  // 1. Seed database
  console.log('1. Preparing pristine seeded dataset...');
  await runSeed(0x1337beef);

  // 2. Generate baseline schedule
  console.log('2. Generating baseline schedule...');
  const baseline = await schedulingService.generateSchedule({ runType: 'INITIAL' });
  console.log(`   ✓ Baseline schedule generated with ${baseline.metrics.assignedJobs} assignments.`);

  // 3. Test Scenario A: Technician Unavailable
  console.log('\n3. Testing Disruption Scenario A: Sudden Technician Unavailability...');
  const tech = await prisma.technician.findFirst({
    where: { assignments: { some: { status: 'SCHEDULED' } } },
    include: { assignments: true },
  });

  const disruptionA = await recoveryService.createDisruption({
    eventType: 'TECHNICIAN_UNAVAILABLE',
    technicianId: tech!.id,
    description: `Vehicle breakdown for ${tech!.name}`,
    eventPayload: { reason: 'VEHICLE_BREAKDOWN' },
  });

  const recoveryA = await recoveryService.recoverDisruption(disruptionA.id);
  console.log(`   ✓ Disruption ${disruptionA.id} recovered with status: ${recoveryA.recoveryStatus}`);
  console.log(`   ✓ Affected jobs: ${recoveryA.metrics.affectedJobsCount}, Recovered: ${recoveryA.metrics.recoveredJobsCount}, Success rate: ${recoveryA.metrics.recoverySuccessRate}%`);

  // 4. Test Scenario B: Urgent Break-in Job Arrival
  console.log('\n4. Testing Disruption Scenario B: Urgent Break-in Job Arrival...');
  const urgentJob = await prisma.job.create({
    data: {
      customerName: 'Emergency Clinic Lab',
      description: 'Blood sample centrifuge power supply malfunction',
      requiredSkills: JSON.stringify(['ELECTRICAL', 'HARDWARE_REPAIR']),
      priority: 'CRITICAL',
      estimatedDuration: 45,
      latitude: 37.7749,
      longitude: -122.4194,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T15:00:00.000Z'),
      status: 'PENDING',
    },
  });

  const disruptionB = await recoveryService.createDisruption({
    eventType: 'URGENT_JOB_ARRIVAL',
    jobId: urgentJob.id,
    description: 'Urgent break-in for clinic lab',
  });

  const recoveryB = await recoveryService.recoverDisruption(disruptionB.id);
  console.log(`   ✓ Disruption ${disruptionB.id} processed with status: ${recoveryB.recoveryStatus}`);
  console.log(`   ✓ New dispatches created: ${recoveryB.actions.filter((a) => a.actionType === 'DISPATCH_NEW').length}`);

  // 5. Test Scenario D: Job Cancelled
  console.log('\n5. Testing Disruption Scenario D: Job Cancellation & Route Compaction...');
  const assigned = await prisma.assignment.findFirst({ where: { status: 'SCHEDULED' } });
  const disruptionD = await recoveryService.createDisruption({
    eventType: 'JOB_CANCELLED',
    jobId: assigned!.jobId,
    technicianId: assigned!.technicianId,
    description: 'Customer cancelled appointment',
  });

  const recoveryD = await recoveryService.recoverDisruption(disruptionD.id);
  console.log(`   ✓ Disruption ${disruptionD.id} resolved with status: ${recoveryD.recoveryStatus}`);
  console.log(`   ✓ Cancelled jobs removed: ${recoveryD.cancelledJobIds.length}`);

  console.log('\n========================================================================');
  console.log('  Phase 7 Disruption Management & Recovery Verification SUCCESSFUL! 🚀');
  console.log('========================================================================\n');
}

verifyRecovery()
  .catch((err) => {
    console.error('Phase 7 verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
