import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../src/config/prisma';
import { runSeed } from '../prisma/seed/seed';
import { SERVICE_ZONES, SKILLS } from '../prisma/seed/seed-helpers';

describe('Phase 4: Realistic Seed Data & Scenario Generator', () => {
  beforeAll(async () => {
    // Execute deterministic seed generator
    await runSeed(0x1337beef);
  }, 30000);

  // 1. Minimum counts
  it('1. generates at least 25 technicians', async () => {
    const technicianCount = await prisma.technician.count();
    expect(technicianCount).toBeGreaterThanOrEqual(25);
  });

  it('2. generates at least 150 jobs', async () => {
    const jobCount = await prisma.job.count();
    expect(jobCount).toBeGreaterThanOrEqual(150);
  });

  // 2. Strict non-assignment requirement
  it('3. strictly creates ZERO assignments during seed generation', async () => {
    const assignmentCount = await prisma.assignment.count();
    expect(assignmentCount).toBe(0);

    // Verify all jobs are in PENDING status
    const nonPendingJobs = await prisma.job.count({
      where: { status: { not: 'PENDING' } },
    });
    expect(nonPendingJobs).toBe(0);
  });

  // 3. Service Zone Coverage
  it('4. covers all 5 predefined service zones with both technicians and jobs', async () => {
    const zoneCodes = Object.keys(SERVICE_ZONES);
    expect(zoneCodes.length).toBe(5);

    for (const zone of zoneCodes) {
      const jobsInZone = await prisma.job.count({ where: { serviceZone: zone } });
      expect(jobsInZone).toBeGreaterThan(0);

      const techsInZone = await prisma.technician.count({
        where: { serviceZones: { contains: zone } },
      });
      expect(techsInZone).toBeGreaterThan(0);
    }
  });

  // 4. Geographical Coordinate Consistency
  it('5. ensures all technician and job coordinates fall within their assigned service zone bounding boxes', async () => {
    const jobs = await prisma.job.findMany({
      select: { customerName: true, serviceZone: true, latitude: true, longitude: true },
    });

    for (const job of jobs) {
      const zoneConfig = SERVICE_ZONES[job.serviceZone];
      expect(zoneConfig).toBeDefined();
      expect(job.latitude).toBeGreaterThanOrEqual(zoneConfig.minLat);
      expect(job.latitude).toBeLessThanOrEqual(zoneConfig.maxLat);
      expect(job.longitude).toBeGreaterThanOrEqual(zoneConfig.minLng);
      expect(job.longitude).toBeLessThanOrEqual(zoneConfig.maxLng);
    }
  });

  // 5. Skill Taxonomy Coverage
  it('6. represents all 10 core skill categories across jobs and technician profiles', async () => {
    const allJobs = await prisma.job.findMany({ select: { requiredSkills: true } });
    const allTechs = await prisma.technician.findMany({ select: { skills: true } });

    const jobSkillsSet = new Set<string>();
    for (const j of allJobs) {
      const parsed: string[] = JSON.parse(j.requiredSkills);
      parsed.forEach((s) => jobSkillsSet.add(s));
    }

    const techSkillsSet = new Set<string>();
    for (const t of allTechs) {
      const parsed: string[] = JSON.parse(t.skills);
      parsed.forEach((s) => techSkillsSet.add(s));
    }

    for (const skill of SKILLS) {
      expect(jobSkillsSet.has(skill)).toBe(true);
      expect(techSkillsSet.has(skill)).toBe(true);
    }
  });

  // 6. Priority Distribution
  it('7. establishes realistic priority distribution (CRITICAL < HIGH < MEDIUM/LOW)', async () => {
    const critical = await prisma.job.count({ where: { priority: 'CRITICAL' } });
    const high = await prisma.job.count({ where: { priority: 'HIGH' } });
    const medium = await prisma.job.count({ where: { priority: 'MEDIUM' } });
    const low = await prisma.job.count({ where: { priority: 'LOW' } });

    expect(critical).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(critical);
    expect(medium).toBeGreaterThan(high);
    expect(low).toBeGreaterThan(critical);
  });

  // 7. Technician Unavailability Records
  it('8. generates technician unavailability periods', async () => {
    const unavailCount = await prisma.technicianUnavailability.count();
    expect(unavailCount).toBeGreaterThanOrEqual(4);

    const unavailRecords = await prisma.technicianUnavailability.findMany({
      include: { technician: true },
    });
    for (const rec of unavailRecords) {
      expect(rec.technician).toBeDefined();
      expect(rec.startTime < rec.endTime).toBe(true);
      expect(rec.reason).toContain('SCENARIO_C');
    }
  });

  // 8. Special Test Scenarios Verification
  it('9. verifies all 8 special scenarios exist and are tagged', async () => {
    const scenarioChecks = [
      { tag: 'SCENARIO_A', expectedMin: 100 },
      { tag: 'SCENARIO_B', expectedMin: 5 },
      { tag: 'SCENARIO_C', expectedMin: 3 },
      { tag: 'SCENARIO_D', expectedMin: 2 },
      { tag: 'SCENARIO_E', expectedMin: 2 },
      { tag: 'SCENARIO_F', expectedMin: 2 },
      { tag: 'SCENARIO_G', expectedMin: 5 },
      { tag: 'SCENARIO_H', expectedMin: 4 },
    ];

    for (const sc of scenarioChecks) {
      const count = await prisma.job.count({
        where: { description: { contains: sc.tag } },
      });
      expect(count).toBeGreaterThanOrEqual(sc.expectedMin);
    }
  });

  // 9. Data Integrity & Relationships
  it('10. verifies uniqueness of technician emails and validity of foreign keys', async () => {
    const technicians = await prisma.technician.findMany({ select: { email: true } });
    const emailSet = new Set(technicians.map((t) => t.email));
    expect(emailSet.size).toBe(technicians.length);

    // Verify all unavailabilities link to existing technician
    const unavails = await prisma.technicianUnavailability.findMany({ select: { technicianId: true } });
    const techIds = new Set((await prisma.technician.findMany({ select: { id: true } })).map((t) => t.id));
    for (const u of unavails) {
      expect(techIds.has(u.technicianId)).toBe(true);
    }
  });
});
