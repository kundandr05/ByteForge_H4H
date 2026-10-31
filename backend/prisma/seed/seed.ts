import { prisma } from '../../src/config/prisma';
import { SeededPRNG } from './seed-helpers';
import { generateTechnicians } from './technician-seeder';
import { generateScenarios } from './scenario-seeder';
import { generateNormalJobs } from './job-seeder';

export async function runSeed(seedValue = 0x1337beef): Promise<{
  techniciansCount: number;
  jobsCount: number;
  unavailabilitiesCount: number;
  assignmentsCount: number;
}> {
  console.log(`\n======================================================`);
  console.log(`  DispatchGrid Realistic Seed Generator (Phase 4)`);
  console.log(`  Deterministic PRNG Seed: 0x${seedValue.toString(16).toUpperCase()}`);
  console.log(`======================================================\n`);

  const prng = new SeededPRNG(seedValue);

  // 1. Clean existing records in safe foreign-key order
  console.log('1. Clearing existing records in foreign-key safe order...');
  await prisma.schedulingRunDetail.deleteMany({});
  await prisma.schedulingRun.deleteMany({});
  await prisma.assignment.deleteMany({});
  await prisma.technicianUnavailability.deleteMany({});
  await prisma.disruptionEvent.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.technician.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.idempotencyRecord.deleteMany({});
  console.log('   ✓ Database tables cleared.');

  // 2. Generate and persist Technicians
  console.log('\n2. Generating realistic technician profiles...');
  const technicianDefs = generateTechnicians(prng);
  const createdTechnicians = [];

  for (const t of technicianDefs) {
    const record = await prisma.technician.create({
      data: {
        name: t.name,
        email: t.email,
        phone: t.phone,
        skills: JSON.stringify(t.skills),
        serviceZones: JSON.stringify(t.serviceZones),
        latitude: t.latitude,
        longitude: t.longitude,
        shiftStart: t.shiftStart,
        shiftEnd: t.shiftEnd,
        availabilityStatus: t.availabilityStatus,
      },
    });
    createdTechnicians.push(record);
  }
  console.log(`   ✓ Inserted ${createdTechnicians.length} technicians across 5 service zones.`);

  // 3. Generate Special Scenarios and Unavailability Periods
  console.log('\n3. Generating test scenarios & technician unavailability periods...');
  const { scenarioJobs, unavailabilities } = generateScenarios(prng);

  const techMapByEmail = new Map(createdTechnicians.map((t) => [t.email, t.id]));
  let createdUnavailCount = 0;

  for (const u of unavailabilities) {
    const techId = techMapByEmail.get(u.technicianEmail);
    if (techId) {
      await prisma.technicianUnavailability.create({
        data: {
          technicianId: techId,
          startTime: u.startTime,
          endTime: u.endTime,
          reason: u.reason,
        },
      });
      createdUnavailCount++;
    }
  }
  console.log(`   ✓ Created ${createdUnavailCount} technician unavailability records.`);

  // 4. Generate Normal Operations Jobs (Scenario A)
  console.log('\n4. Generating baseline jobs across all service zones...');
  const normalJobs = generateNormalJobs(prng, 135);
  const allJobs = [...normalJobs, ...scenarioJobs];

  // Insert all jobs with status PENDING (strictly no assignments)
  console.log(`   Inserting ${allJobs.length} service jobs (all PENDING, 0 assignments)...`);
  for (const job of allJobs) {
    await prisma.job.create({
      data: {
        customerName: job.customerName,
        description: job.description,
        requiredSkills: JSON.stringify(job.requiredSkills),
        priority: job.priority,
        estimatedDuration: job.estimatedDuration,
        latitude: job.latitude,
        longitude: job.longitude,
        serviceZone: job.serviceZone,
        earliestStart: job.earliestStart,
        latestEnd: job.latestEnd,
        slaDeadline: job.slaDeadline,
        status: job.status,
      },
    });
  }
  console.log(`   ✓ Inserted ${allJobs.length} jobs successfully.`);

  // 5. Verification & Telemetry Collection
  const totalTechnicians = await prisma.technician.count();
  const totalJobs = await prisma.job.count();
  const totalAssignments = await prisma.assignment.count();
  const totalUnavailability = await prisma.technicianUnavailability.count();

  // Aggregate jobs by priority
  const jobsByPriority = await prisma.job.groupBy({
    by: ['priority'],
    _count: { id: true },
  });

  // Aggregate jobs by service zone
  const jobsByZone = await prisma.job.groupBy({
    by: ['serviceZone'],
    _count: { id: true },
  });

  // Aggregate technicians by availability
  const techsByAvailability = await prisma.technician.groupBy({
    by: ['availabilityStatus'],
    _count: { id: true },
  });

  // Count skills distribution
  const allDbJobs = await prisma.job.findMany({ select: { requiredSkills: true } });
  const skillCounts: Record<string, number> = {};
  for (const j of allDbJobs) {
    const skills: string[] = JSON.parse(j.requiredSkills);
    for (const s of skills) {
      skillCounts[s] = (skillCounts[s] || 0) + 1;
    }
  }

  // Count scenario breakdown
  const scenarioCounts = {
    'SCENARIO A: Normal Operations': normalJobs.length,
    'SCENARIO B: High Priority Competition': scenarioJobs.filter((j) => j.scenarioTag === 'SCENARIO_B_COMPETITION').length,
    'SCENARIO C: Technician Unavailability Conflict': scenarioJobs.filter((j) => j.scenarioTag === 'SCENARIO_C_UNAVAILABILITY').length,
    'SCENARIO D: Travel Time Conflicts': scenarioJobs.filter((j) => j.scenarioTag === 'SCENARIO_D_TRAVEL_CONFLICT').length,
    'SCENARIO E: Missing Skills (Unfulfillable)': scenarioJobs.filter((j) => j.scenarioTag === 'SCENARIO_E_MISSING_SKILLS').length,
    'SCENARIO F: Impossible Deadlines': scenarioJobs.filter((j) => j.scenarioTag === 'SCENARIO_F_IMPOSSIBLE_DEADLINE').length,
    'SCENARIO G: Overloaded Zone': scenarioJobs.filter((j) => j.scenarioTag === 'SCENARIO_G_OVERLOADED_ZONE').length,
    'SCENARIO H: Urgent Break-in Arrivals': scenarioJobs.filter((j) => j.scenarioTag === 'SCENARIO_H_URGENT_ARRIVAL').length,
  };

  // Print Summary Table
  console.log(`\n======================================================`);
  console.log(`             SEED DATA GENERATION SUMMARY`);
  console.log(`======================================================`);
  console.log(`Total Technicians Generated   : ${totalTechnicians} (Requirement: >= 25)`);
  console.log(`Total Jobs Generated          : ${totalJobs} (Requirement: >= 150)`);
  console.log(`Total Active Assignments      : ${totalAssignments} (Strictly 0 during seeding)`);
  console.log(`Unavailable Periods Recorded  : ${totalUnavailability}`);
  console.log(`------------------------------------------------------`);
  console.log(`Jobs by Priority:`);
  for (const p of jobsByPriority) {
    console.log(`  - ${p.priority.padEnd(12)}: ${p._count.id}`);
  }
  console.log(`------------------------------------------------------`);
  console.log(`Jobs by Service Zone:`);
  for (const z of jobsByZone) {
    console.log(`  - ${z.serviceZone.padEnd(16)}: ${z._count.id}`);
  }
  console.log(`------------------------------------------------------`);
  console.log(`Technicians by Availability:`);
  for (const a of techsByAvailability) {
    console.log(`  - ${a.availabilityStatus.padEnd(16)}: ${a._count.id}`);
  }
  console.log(`------------------------------------------------------`);
  console.log(`Job Demand by Required Skill:`);
  for (const [skill, count] of Object.entries(skillCounts)) {
    console.log(`  - ${skill.padEnd(20)}: ${count} jobs`);
  }
  console.log(`------------------------------------------------------`);
  console.log(`Special Test Scenarios Initialized:`);
  for (const [scen, count] of Object.entries(scenarioCounts)) {
    console.log(`  - ${scen.padEnd(46)}: ${count} jobs`);
  }
  console.log(`======================================================\n`);

  return {
    techniciansCount: totalTechnicians,
    jobsCount: totalJobs,
    unavailabilitiesCount: totalUnavailability,
    assignmentsCount: totalAssignments,
  };
}

// Standalone execution entrypoint
if (require.main === module || process.argv[1]?.includes('seed.ts')) {
  runSeed()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('Fatal Seed Error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
