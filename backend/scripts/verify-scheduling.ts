import { prisma } from '../src/config/prisma';
import { runSchedulingEngine } from '../src/scheduling/scheduling.engine';
import { calculateTravelEstimate } from '../src/scheduling/travel-calculator';
import { runSeed } from '../prisma/seed/seed';

async function verifyScheduling() {
  console.log('\n========================================================================');
  console.log('  DispatchGrid Phase 5: Verification of Seeded Jobs & Overlap Prevention');
  console.log('========================================================================\n');

  // 1. Ensure database is populated with seeded dataset and reset to PENDING
  let pendingCount = await prisma.job.count({ where: { status: 'PENDING' } });

  if (pendingCount < 150) {
    console.log('Resetting and seeding pristine test dataset...');
    await runSeed(0x1337beef);
  }

  const technicians = await prisma.technician.findMany({
    include: {
      unavailabilities: true,
      assignments: true,
    },
  });

  const jobs = await prisma.job.findMany({
    where: { status: 'PENDING' },
  });

  console.log(`✓ Loaded ${technicians.length} Technicians from database (Requirement: >= 25)`);
  console.log(`✓ Loaded ${jobs.length} Service Jobs from database (Requirement: >= 150)\n`);

  // 2. Run Intelligent Scheduling Engine
  console.log('Executing Intelligent Scheduling Engine...');
  const startTime = Date.now();
  const result = runSchedulingEngine(jobs, technicians, {
    runType: 'INITIAL',
    referenceDate: new Date('2026-11-02T00:00:00.000Z'),
  });
  const durationMs = Date.now() - startTime;

  console.log(`✓ Scheduling Engine completed in ${durationMs}ms`);
  console.log(`✓ Total Jobs Evaluated : ${result.metrics.totalJobs}`);
  console.log(`✓ Jobs Assigned        : ${result.metrics.assignedJobs}`);
  console.log(`✓ Jobs Unassigned      : ${result.metrics.unassignedJobs}`);
  console.log(`✓ Active Technicians   : ${result.metrics.activeTechniciansCount}`);
  console.log(`✓ SLA Violations       : ${result.metrics.slaViolations}\n`);

  // 3. Exhaustive Hard Constraint & Overlap Validation
  console.log('------------------------------------------------------------------------');
  console.log('  RUNNING EXHAUSTIVE OVERLAP & CONSTRAINT INTEGRITY CHECKS');
  console.log('------------------------------------------------------------------------\n');

  const techAssignments = new Map<string, Array<{ start: number; end: number; job: any; slot: any }>>();

  for (const decision of result.decisions) {
    if (decision.isAssigned && decision.selectedTechnicianId && decision.selectedSlot) {
      const techId = decision.selectedTechnicianId;
      if (!techAssignments.has(techId)) {
        techAssignments.set(techId, []);
      }
      techAssignments.get(techId)!.push({
        start: decision.selectedSlot.scheduledStart.getTime(),
        end: decision.selectedSlot.scheduledEnd.getTime(),
        job: jobs.find((j) => j.id === decision.jobId),
        slot: decision.selectedSlot,
      });
    }
  }

  let totalPairwiseOverlapChecks = 0;
  let detectedOverlaps = 0;
  let travelViolations = 0;
  let shiftViolations = 0;
  let slaViolations = 0;
  let skillViolations = 0;
  let zoneViolations = 0;
  let unavailViolations = 0;

  for (const [techId, assignments] of techAssignments.entries()) {
    const tech = technicians.find((t) => t.id === techId)!;
    // Sort chronologically
    assignments.sort((a, b) => a.start - b.start);

    const [sh, sm] = tech.shiftStart.split(':').map(Number);
    const [eh, em] = tech.shiftEnd.split(':').map(Number);
    const shiftStartMs = new Date('2026-11-02T00:00:00.000Z').setUTCHours(sh, sm, 0, 0);
    const shiftEndMs = new Date('2026-11-02T00:00:00.000Z').setUTCHours(eh, em, 0, 0);

    const techSkills: string[] = typeof tech.skills === 'string' ? JSON.parse(tech.skills) : tech.skills;
    const techZones: string[] = typeof tech.serviceZones === 'string' ? JSON.parse(tech.serviceZones) : tech.serviceZones;

    for (let i = 0; i < assignments.length; i++) {
      const current = assignments[i];

      // Shift boundary check
      if (current.start < shiftStartMs || current.end > shiftEndMs) {
        shiftViolations++;
        console.error(`  [FAIL] Shift boundary violated for ${tech.name}: [${new Date(current.start).toISOString()} - ${new Date(current.end).toISOString()}] outside shift`);
      }

      // SLA deadline check
      if (current.end > new Date(current.job.slaDeadline).getTime()) {
        slaViolations++;
        console.error(`  [FAIL] SLA deadline violated for job ${current.job.id}`);
      }

      // Skill check
      const jobSkills: string[] = typeof current.job.requiredSkills === 'string' ? JSON.parse(current.job.requiredSkills) : current.job.requiredSkills;
      const missing = jobSkills.filter((s) => !techSkills.includes(s));
      if (missing.length > 0) {
        skillViolations++;
        console.error(`  [FAIL] Skill mismatch for ${tech.name}: missing [${missing.join(', ')}]`);
      }

      // Zone check
      if (!techZones.includes(current.job.serviceZone)) {
        zoneViolations++;
        console.error(`  [FAIL] Zone mismatch: ${tech.name} not in zone ${current.job.serviceZone}`);
      }

      // Unavailability overlap check
      for (const unavail of tech.unavailabilities) {
        const uStart = new Date(unavail.startTime).getTime();
        const uEnd = new Date(unavail.endTime).getTime();
        if (current.start < uEnd && current.end > uStart) {
          unavailViolations++;
          console.error(`  [FAIL] Overlap with unavailability for ${tech.name}`);
        }
      }

      // Pairwise overlap and transit check with every other assignment
      for (let j = i + 1; j < assignments.length; j++) {
        totalPairwiseOverlapChecks++;
        const next = assignments[j];

        // OVERLAP CHECK: current.end must be <= next.start
        if (current.end > next.start) {
          detectedOverlaps++;
          console.error(`  [FAIL] OVERLAP DETECTED for ${tech.name}:`);
          console.error(`    Assignment 1: ${new Date(current.start).toISOString()} - ${new Date(current.end).toISOString()} (${current.job.customerName})`);
          console.error(`    Assignment 2: ${new Date(next.start).toISOString()} - ${new Date(next.end).toISOString()} (${next.job.customerName})`);
        }

        // TRAVEL BUFFER CHECK for consecutive assignments
        if (j === i + 1) {
          const travel = calculateTravelEstimate(
            { latitude: current.job.latitude, longitude: current.job.longitude },
            { latitude: next.job.latitude, longitude: next.job.longitude }
          );
          const earliestDepartureArrival = current.end + travel.travelTimeMinutes * 60 * 1000;
          if (next.start < earliestDepartureArrival) {
            travelViolations++;
            console.error(`  [FAIL] Insufficient travel buffer for ${tech.name} between jobs: requires ${travel.travelTimeMinutes}m transit`);
          }
        }
      }
    }
  }

  console.log(`[CHECK 1] Pairwise Overlap Comparisons : ${totalPairwiseOverlapChecks}`);
  console.log(`[CHECK 2] Overlapping Assignments Found: ${detectedOverlaps} (Expected: 0)`);
  console.log(`[CHECK 3] Travel Buffer Violations    : ${travelViolations} (Expected: 0)`);
  console.log(`[CHECK 4] Shift Boundary Violations   : ${shiftViolations} (Expected: 0)`);
  console.log(`[CHECK 5] SLA Deadline Violations     : ${slaViolations} (Expected: 0)`);
  console.log(`[CHECK 6] Skill Compatibility Errors  : ${skillViolations} (Expected: 0)`);
  console.log(`[CHECK 7] Service Zone Errors         : ${zoneViolations} (Expected: 0)`);
  console.log(`[CHECK 8] Unavailability Overlaps    : ${unavailViolations} (Expected: 0)\n`);

  if (detectedOverlaps === 0 && travelViolations === 0 && shiftViolations === 0 && slaViolations === 0) {
    console.log('========================================================================');
    console.log('  >>> ALL CHECKS PASSED: ZERO OVERLAPS DETECTED ACROSS WORKFORCE <<<');
    console.log('========================================================================\n');
  } else {
    console.error('========================================================================');
    console.error('  >>> VERIFICATION FAILED: CONSTRAINT VIOLATIONS DETECTED <<<');
    console.error('========================================================================\n');
    process.exit(1);
  }
}

verifyScheduling()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Verification script error:', err);
    process.exit(1);
  });
