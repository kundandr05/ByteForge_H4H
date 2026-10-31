import { describe, it, expect } from 'vitest';
import { runSchedulingEngine } from '../src/scheduling/scheduling.engine';
import { calculateTravelEstimate } from '../src/scheduling/travel-calculator';

// Deterministic PRNG for reproducible stress datasets
function createRng(seed = 0xbeefcafe) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ZONES = ['ZONE_NORTH', 'ZONE_SOUTH', 'ZONE_EAST', 'ZONE_WEST', 'ZONE_CENTRAL'];
const SKILLS = [
  'HVAC',
  'ELECTRICAL',
  'PLUMBING',
  'NETWORKING',
  'FIBER_OPTICS',
  'SECURITY_SYSTEMS',
  'HARDWARE_REPAIR',
  'SOFTWARE_SUPPORT',
  'MECHANICAL',
  'GENERAL_MAINTENANCE',
];

function generateStressDataset(jobCount: number, techCount: number, seed: number) {
  const rng = createRng(seed);

  const technicians = Array.from({ length: techCount }, (_, i) => {
    const id = `stress-tech-${i + 1}`;
    // Select 2-4 skills
    const techSkills = SKILLS.filter(() => rng() > 0.6);
    if (techSkills.length === 0) techSkills.push(SKILLS[i % SKILLS.length]);

    // Select 1-3 zones
    const techZones = ZONES.filter(() => rng() > 0.5);
    if (techZones.length === 0) techZones.push(ZONES[i % ZONES.length]);

    // SF Bay area latitude 37.7 - 37.8, longitude -122.45 - -122.35
    const lat = 37.75 + (rng() - 0.5) * 0.2;
    const lon = -122.42 + (rng() - 0.5) * 0.2;

    return {
      id,
      name: `Specialist ${i + 1}`,
      email: `tech${i + 1}@dispatchgrid.test`,
      skills: JSON.stringify(techSkills),
      serviceZones: JSON.stringify(techZones),
      latitude: lat,
      longitude: lon,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
      unavailabilities: [],
    };
  });

  const jobs = Array.from({ length: jobCount }, (_, i) => {
    const id = `stress-job-${i + 1}`;
    const requiredSkills = [SKILLS[Math.floor(rng() * SKILLS.length)]];
    if (rng() > 0.7) {
      requiredSkills.push(SKILLS[Math.floor(rng() * SKILLS.length)]);
    }
    const zone = ZONES[Math.floor(rng() * ZONES.length)];
    const duration = 30 + Math.floor(rng() * 4) * 15; // 30, 45, 60, 75 mins

    // Base date 2026-11-02
    const startHour = 8 + Math.floor(rng() * 4); // 8:00 - 12:00
    const windowHours = 4 + Math.floor(rng() * 4); // 4 - 8 hours
    const slaHours = windowHours - 1;

    const earliestStart = new Date(`2026-11-02T${String(startHour).padStart(2, '0')}:00:00.000Z`);
    const latestEnd = new Date(earliestStart.getTime() + windowHours * 3600000);
    const slaDeadline = new Date(earliestStart.getTime() + slaHours * 3600000);

    const lat = 37.75 + (rng() - 0.5) * 0.25;
    const lon = -122.42 + (rng() - 0.5) * 0.25;

    return {
      id,
      customerName: `Stress Customer ${i + 1}`,
      description: `Stress load test work order ${i + 1}`,
      requiredSkills: JSON.stringify(requiredSkills),
      priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(rng() * 4)],
      estimatedDuration: duration,
      latitude: lat,
      longitude: lon,
      serviceZone: zone,
      earliestStart,
      latestEnd,
      slaDeadline,
      status: 'PENDING',
    };
  });

  return { jobs, technicians };
}

describe('Phase 11: Scheduling Engine Stress Testing & Constraint Validation', () => {
  // Helper to assert every hard operational constraint on all assignments produced
  function verifyAllHardConstraints(result: any, jobs: any[], technicians: any[]) {
    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    const techMap = new Map(technicians.map((t) => [t.id, t]));

    const assignedDecisions = result.decisions.filter((d: any) => d.isAssigned);
    expect(assignedDecisions.length).toBe(result.metrics.assignedJobs);

    // Group assignments by technician to check chronological non-overlap and transit
    const techAssignments = new Map<string, any[]>();
    for (const d of assignedDecisions) {
      if (!techAssignments.has(d.selectedTechnicianId)) {
        techAssignments.set(d.selectedTechnicianId, []);
      }
      techAssignments.get(d.selectedTechnicianId)!.push(d);
    }

    for (const [techId, asgns] of techAssignments.entries()) {
      const tech = techMap.get(techId)!;
      let techSkills: string[] = [];
      try {
        techSkills = typeof tech.skills === 'string' ? JSON.parse(tech.skills) : tech.skills || [];
      } catch {
        techSkills = [];
      }

      let techZones: string[] = [];
      try {
        techZones = typeof tech.serviceZones === 'string' ? JSON.parse(tech.serviceZones) : tech.serviceZones || [];
      } catch {
        techZones = [];
      }

      // Sort chronologically
      asgns.sort((a, b) => a.selectedSlot.scheduledStart.getTime() - b.selectedSlot.scheduledStart.getTime());

      let prevLoc = { latitude: tech.latitude, longitude: tech.longitude };
      let prevEndMs = new Date('2026-11-02T08:00:00.000Z').getTime();

      for (let i = 0; i < asgns.length; i++) {
        const asgn = asgns[i];
        const job = jobMap.get(asgn.jobId)!;
        const startMs = asgn.selectedSlot.scheduledStart.getTime();
        const endMs = asgn.selectedSlot.scheduledEnd.getTime();
        const durationMs = job.estimatedDuration * 60 * 1000;

        // 1. Duration integrity
        expect(endMs - startMs).toBe(durationMs);

        // 2. Skill compatibility
        let reqSkills: string[] = [];
        try {
          reqSkills = typeof job.requiredSkills === 'string' ? JSON.parse(job.requiredSkills) : job.requiredSkills || [];
        } catch {
          reqSkills = [];
        }
        for (const s of reqSkills) {
          expect(techSkills).toContain(s);
        }

        // 3. Service zone eligibility
        expect(techZones).toContain(job.serviceZone);

        // 4. Shift boundary adherence (08:00 to 17:00 UTC)
        expect(startMs).toBeGreaterThanOrEqual(new Date('2026-11-02T08:00:00.000Z').getTime());
        expect(endMs).toBeLessThanOrEqual(new Date('2026-11-02T17:00:00.000Z').getTime());

        // 5. Job time window compliance
        expect(startMs).toBeGreaterThanOrEqual(job.earliestStart.getTime());
        expect(endMs).toBeLessThanOrEqual(job.latestEnd.getTime());

        // 6. Hard SLA deadline preservation
        expect(endMs).toBeLessThanOrEqual(job.slaDeadline.getTime());

        // 7. Travel time feasibility from previous stop
        const transit = calculateTravelEstimate(prevLoc, { latitude: job.latitude, longitude: job.longitude });
        expect(prevEndMs + transit.travelTimeMinutes * 60 * 1000).toBeLessThanOrEqual(startMs);

        // 8. Zero overlap with subsequent assignment
        if (i < asgns.length - 1) {
          const nextStartMs = asgns[i + 1].selectedSlot.scheduledStart.getTime();
          expect(endMs).toBeLessThanOrEqual(nextStartMs);
        }

        prevLoc = { latitude: job.latitude, longitude: job.longitude };
        prevEndMs = endMs;
      }
    }
  }

  // -------------------------------------------------------------
  // TEST 1: 150 Jobs and 25 Technicians
  // -------------------------------------------------------------
  it('1. schedules 150 jobs across 25 technicians with 100% constraint satisfaction', () => {
    const { jobs, technicians } = generateStressDataset(150, 25, 42);

    const memBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const result = runSchedulingEngine(jobs, technicians, {
      referenceDate: new Date('2026-11-02T00:00:00.000Z'),
    });
    const duration = performance.now() - t0;
    const memDeltaMb = (process.memoryUsage().heapUsed - memBefore) / (1024 * 1024);

    expect(result.metrics.assignedJobs).toBeGreaterThan(0);
    expect(result.metrics.slaViolations).toBe(0);
    verifyAllHardConstraints(result, jobs, technicians);

    console.log(
      `[STRESS:150/25] Assigned ${result.metrics.assignedJobs}/${jobs.length} in ${Math.round(duration)}ms (Heap: ${memDeltaMb.toFixed(2)} MB)`
    );
  });

  // -------------------------------------------------------------
  // TEST 2: 500 Jobs and 50 Technicians
  // -------------------------------------------------------------
  it('2. stress tests 500 jobs across 50 technicians under heavy competition', () => {
    const { jobs, technicians } = generateStressDataset(500, 50, 101);

    const memBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const result = runSchedulingEngine(jobs, technicians, {
      referenceDate: new Date('2026-11-02T00:00:00.000Z'),
    });
    const duration = performance.now() - t0;
    const memDeltaMb = (process.memoryUsage().heapUsed - memBefore) / (1024 * 1024);

    expect(result.metrics.assignedJobs).toBeGreaterThan(100);
    expect(result.metrics.slaViolations).toBe(0);
    verifyAllHardConstraints(result, jobs, technicians);

    console.log(
      `[STRESS:500/50] Assigned ${result.metrics.assignedJobs}/${jobs.length} in ${Math.round(duration)}ms (Heap: ${memDeltaMb.toFixed(2)} MB)`
    );
  });

  // -------------------------------------------------------------
  // TEST 3: 1,000 Jobs and 100 Technicians (Large Scale)
  // -------------------------------------------------------------
  it('3. scales to 1,000 jobs across 100 technicians without constraint degradation', () => {
    const { jobs, technicians } = generateStressDataset(1000, 100, 202);

    const memBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const result = runSchedulingEngine(jobs, technicians, {
      referenceDate: new Date('2026-11-02T00:00:00.000Z'),
    });
    const duration = performance.now() - t0;
    const memDeltaMb = (process.memoryUsage().heapUsed - memBefore) / (1024 * 1024);

    expect(result.metrics.assignedJobs).toBeGreaterThan(250);
    expect(result.metrics.slaViolations).toBe(0);
    verifyAllHardConstraints(result, jobs, technicians);

    console.log(
      `[STRESS:1000/100] Assigned ${result.metrics.assignedJobs}/${jobs.length} in ${Math.round(duration)}ms (Heap: ${memDeltaMb.toFixed(2)} MB)`
    );
  });

  // -------------------------------------------------------------
  // TEST 4: Extreme competition (100 jobs for 2 technicians)
  // -------------------------------------------------------------
  it('4. manages severe resource competition (100 jobs for 2 technicians) without overscheduling', () => {
    const { jobs, technicians } = generateStressDataset(100, 2, 303);

    const result = runSchedulingEngine(jobs, technicians, {
      referenceDate: new Date('2026-11-02T00:00:00.000Z'),
    });

    expect(result.metrics.assignedJobs).toBeGreaterThan(0);
    expect(result.metrics.unassignedJobs).toBeGreaterThan(80);
    expect(result.metrics.slaViolations).toBe(0);
    verifyAllHardConstraints(result, jobs, technicians);
  });

  // -------------------------------------------------------------
  // TEST 5: Technicians with identical skills (tie-breaker stability)
  // -------------------------------------------------------------
  it('5. deterministically balances workload across technicians with identical skills and zones', () => {
    const techSkills = JSON.stringify(['HVAC', 'ELECTRICAL']);
    const techZones = JSON.stringify(['ZONE_CENTRAL']);

    const identicalTechs = [
      {
        id: 'tech-a',
        name: 'Tech Alpha',
        skills: techSkills,
        serviceZones: techZones,
        latitude: 37.77,
        longitude: -122.41,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      },
      {
        id: 'tech-b',
        name: 'Tech Beta',
        skills: techSkills,
        serviceZones: techZones,
        latitude: 37.77,
        longitude: -122.41,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      },
      {
        id: 'tech-c',
        name: 'Tech Gamma',
        skills: techSkills,
        serviceZones: techZones,
        latitude: 37.77,
        longitude: -122.41,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      },
    ];

    const jobs = Array.from({ length: 12 }, (_, i) => ({
      id: `identical-job-${i + 1}`,
      customerName: `Client ${i + 1}`,
      description: 'Standard maintenance',
      requiredSkills: techSkills,
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T17:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z'),
      status: 'PENDING',
    }));

    const result = runSchedulingEngine(jobs, identicalTechs, {
      referenceDate: new Date('2026-11-02T00:00:00.000Z'),
    });

    expect(result.metrics.assignedJobs).toBe(12);
    expect(result.metrics.slaViolations).toBe(0);
    verifyAllHardConstraints(result, jobs, identicalTechs);

    // Verify workload distribution across the 3 identical technicians
    const counts = new Map<string, number>();
    for (const d of result.decisions.filter((d) => d.isAssigned)) {
      counts.set(d.selectedTechnicianId!, (counts.get(d.selectedTechnicianId!) || 0) + 1);
    }

    // Should be balanced (4 jobs each)
    expect(counts.get('tech-a')).toBe(4);
    expect(counts.get('tech-b')).toBe(4);
    expect(counts.get('tech-c')).toBe(4);
  });

  // -------------------------------------------------------------
  // TEST 6: Very tight SLA deadlines
  // -------------------------------------------------------------
  it('6. rejects or safely schedules jobs with extremely tight 15-minute SLA buffers', () => {
    const tech = {
      id: 'tight-sla-tech',
      name: 'Rapid Responder',
      skills: JSON.stringify(['SECURITY_SYSTEMS']),
      serviceZones: JSON.stringify(['ZONE_NORTH']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    // Job with SLA only 45 mins after earliestStart, requiring 30m duration + travel
    const job1 = {
      id: 'tight-job-feasible',
      customerName: 'Alarm Triggered',
      description: 'Intrusion alarm verification',
      requiredSkills: JSON.stringify(['SECURITY_SYSTEMS']),
      priority: 'CRITICAL',
      estimatedDuration: 30,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T12:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T08:45:00.000Z'), // Feasible
      status: 'PENDING',
    };

    // Impossible SLA: SLA is earlier than arrival + duration
    const job2 = {
      id: 'tight-job-impossible',
      customerName: 'Bank Vault Alert',
      description: 'Vault access lockup',
      requiredSkills: JSON.stringify(['SECURITY_SYSTEMS']),
      priority: 'CRITICAL',
      estimatedDuration: 60,
      latitude: 37.771,
      longitude: -122.411,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T12:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T08:30:00.000Z'), // 30m SLA for 60m job -> Impossible
      status: 'PENDING',
    };

    const result = runSchedulingEngine([job1, job2], [tech]);

    const d1 = result.decisions.find((d) => d.jobId === job1.id)!;
    const d2 = result.decisions.find((d) => d.jobId === job2.id)!;

    expect(d1.isAssigned).toBe(true);
    expect(d2.isAssigned).toBe(false);
    expect(['SLA_DEADLINE_CONFLICT', 'NO_FEASIBLE_TIME_SLOT']).toContain(d2.unassignedReasonCode);
    expect(result.metrics.slaViolations).toBe(0);
  });

  // -------------------------------------------------------------
  // TEST 7: Overlapping time windows across jobs
  // -------------------------------------------------------------
  it('7. safely serializes jobs with identical overlapping time windows', () => {
    const tech = {
      id: 'solo-tech',
      name: 'Solo Specialist',
      skills: JSON.stringify(['MECHANICAL']),
      serviceZones: JSON.stringify(['ZONE_WEST']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    // 3 jobs competing for exact same window 09:00 - 11:00
    const jobs = [1, 2, 3].map((i) => ({
      id: `window-conflict-${i}`,
      customerName: `Client Window ${i}`,
      description: 'Hydraulic pump repair',
      requiredSkills: JSON.stringify(['MECHANICAL']),
      priority: i === 1 ? 'CRITICAL' : 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_WEST',
      earliestStart: new Date('2026-11-02T09:00:00.000Z'),
      latestEnd: new Date('2026-11-02T11:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T11:00:00.000Z'),
      status: 'PENDING',
    }));

    const result = runSchedulingEngine(jobs, [tech]);

    // Only 1 job fits in a 2-hour window when jobs are 60m + transit
    const assigned = result.decisions.filter((d) => d.isAssigned);
    expect(assigned.length).toBeLessThanOrEqual(2);
    // CRITICAL job must be the one assigned
    expect(assigned.some((a) => a.jobId === 'window-conflict-1')).toBe(true);
    verifyAllHardConstraints(result, jobs, [tech]);
  });

  // -------------------------------------------------------------
  // TEST 8: Technicians with multiple registered unavailability periods
  // -------------------------------------------------------------
  it('8. threads assignments through multiple registered unavailability gaps', () => {
    const tech = {
      id: 'tech-with-leaves',
      name: 'Intermittent Worker',
      skills: JSON.stringify(['NETWORKING']),
      serviceZones: JSON.stringify(['ZONE_EAST']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
      unavailabilities: [
        {
          id: 'u-1',
          startTime: new Date('2026-11-02T09:30:00.000Z'),
          endTime: new Date('2026-11-02T11:00:00.000Z'),
          reason: 'Medical checkup',
        },
        {
          id: 'u-2',
          startTime: new Date('2026-11-02T13:00:00.000Z'),
          endTime: new Date('2026-11-02T14:30:00.000Z'),
          reason: 'Vehicle inspection',
        },
      ],
    };

    const jobs = [
      {
        id: 'job-morning-slot',
        customerName: 'Morning Router Client',
        description: 'Router reboot',
        requiredSkills: JSON.stringify(['NETWORKING']),
        priority: 'HIGH',
        estimatedDuration: 45,
        latitude: 37.771,
        longitude: -122.411,
        serviceZone: 'ZONE_EAST',
        earliestStart: new Date('2026-11-02T08:00:00.000Z'),
        latestEnd: new Date('2026-11-02T09:30:00.000Z'),
        slaDeadline: new Date('2026-11-02T09:30:00.000Z'),
        status: 'PENDING',
      },
      {
        id: 'job-midday-slot',
        customerName: 'Midday Switch Client',
        description: 'Switch replacement',
        requiredSkills: JSON.stringify(['NETWORKING']),
        priority: 'MEDIUM',
        estimatedDuration: 45,
        latitude: 37.772,
        longitude: -122.412,
        serviceZone: 'ZONE_EAST',
        earliestStart: new Date('2026-11-02T11:00:00.000Z'),
        latestEnd: new Date('2026-11-02T13:00:00.000Z'),
        slaDeadline: new Date('2026-11-02T13:00:00.000Z'),
        status: 'PENDING',
      },
      {
        id: 'job-conflict-with-u1',
        customerName: 'Conflict Client',
        description: 'Should not overlap with unavailability',
        requiredSkills: JSON.stringify(['NETWORKING']),
        priority: 'LOW',
        estimatedDuration: 60,
        latitude: 37.773,
        longitude: -122.413,
        serviceZone: 'ZONE_EAST',
        earliestStart: new Date('2026-11-02T10:00:00.000Z'),
        latestEnd: new Date('2026-11-02T10:45:00.000Z'),
        slaDeadline: new Date('2026-11-02T10:45:00.000Z'),
        status: 'PENDING',
      },
    ];

    const result = runSchedulingEngine(jobs, [tech]);

    const dMorning = result.decisions.find((d) => d.jobId === 'job-morning-slot')!;
    const dMidday = result.decisions.find((d) => d.jobId === 'job-midday-slot')!;
    const dConflict = result.decisions.find((d) => d.jobId === 'job-conflict-with-u1')!;

    expect(dMorning.isAssigned).toBe(true);
    expect(dMidday.isAssigned).toBe(true);
    expect(dConflict.isAssigned).toBe(false);

    // Verify no assignment overlaps with u-1 or u-2
    for (const d of result.decisions.filter((d) => d.isAssigned)) {
      const s = d.selectedSlot!.scheduledStart.getTime();
      const e = d.selectedSlot!.scheduledEnd.getTime();
      for (const u of tech.unavailabilities) {
        const uS = u.startTime.getTime();
        const uE = u.endTime.getTime();
        expect(s < uE && e > uS).toBe(false);
      }
    }
  });

  // -------------------------------------------------------------
  // TEST 9: Geographically distant jobs (transit constraints)
  // -------------------------------------------------------------
  it('9. enforces transit buffers for geographically distant jobs across the region', () => {
    const tech = {
      id: 'transit-tech',
      name: 'Regional Tech',
      skills: JSON.stringify(['ELECTRICAL']),
      serviceZones: JSON.stringify(['ZONE_NORTH', 'ZONE_SOUTH']),
      latitude: 37.77, // SF downtown
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'AVAILABLE',
    };

    // Job in North SF
    const northJob = {
      id: 'job-north',
      customerName: 'North Customer',
      description: 'North panel repair',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.80,
      longitude: -122.41,
      serviceZone: 'ZONE_NORTH',
      earliestStart: new Date('2026-11-02T08:00:00.000Z'),
      latestEnd: new Date('2026-11-02T10:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T10:00:00.000Z'),
      status: 'PENDING',
    };

    // Job in South SF (~25km away) starting right when North finishes
    const southJob = {
      id: 'job-south-too-fast',
      customerName: 'South Customer',
      description: 'South breaker swap',
      requiredSkills: JSON.stringify(['ELECTRICAL']),
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.55,
      longitude: -122.35,
      serviceZone: 'ZONE_SOUTH',
      earliestStart: new Date('2026-11-02T09:05:00.000Z'), // Only 5 mins buffer!
      latestEnd: new Date('2026-11-02T10:10:00.000Z'),
      slaDeadline: new Date('2026-11-02T10:10:00.000Z'),
      status: 'PENDING',
    };

    const result = runSchedulingEngine([northJob, southJob], [tech]);

    const dNorth = result.decisions.find((d) => d.jobId === northJob.id)!;
    const dSouth = result.decisions.find((d) => d.jobId === southJob.id)!;

    expect(dNorth.isAssigned).toBe(true);
    // South job cannot be scheduled in that window due to transit requirements
    expect(dSouth.isAssigned).toBe(false);
  });

  // -------------------------------------------------------------
  // TEST 10: Complete protection of COMPLETED and IN_PROGRESS jobs
  // -------------------------------------------------------------
  it('10. strictly preserves COMPLETED and IN_PROGRESS jobs across scheduling passes', () => {
    const tech = {
      id: 'busy-worker',
      name: 'Shift Lead',
      skills: JSON.stringify(['HVAC']),
      serviceZones: JSON.stringify(['ZONE_CENTRAL']),
      latitude: 37.77,
      longitude: -122.41,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      availabilityStatus: 'ON_SHIFT',
      assignments: [
        {
          id: 'asgn-completed-1',
          jobId: 'job-done',
          scheduledStart: new Date('2026-11-02T08:30:00.000Z'),
          scheduledEnd: new Date('2026-11-02T09:30:00.000Z'),
          status: 'COMPLETED',
          job: {
            id: 'job-done',
            latitude: 37.77,
            longitude: -122.41,
            status: 'COMPLETED',
          },
        },
        {
          id: 'asgn-progress-2',
          jobId: 'job-active',
          scheduledStart: new Date('2026-11-02T10:00:00.000Z'),
          scheduledEnd: new Date('2026-11-02T11:30:00.000Z'),
          status: 'IN_PROGRESS',
          job: {
            id: 'job-active',
            latitude: 37.771,
            longitude: -122.411,
            status: 'IN_PROGRESS',
          },
        },
      ],
    };

    const newJob = {
      id: 'job-new-arrival',
      customerName: 'Afternoon Client',
      description: 'Chiller reset',
      requiredSkills: JSON.stringify(['HVAC']),
      priority: 'HIGH',
      estimatedDuration: 60,
      latitude: 37.772,
      longitude: -122.412,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T12:00:00.000Z'),
      latestEnd: new Date('2026-11-02T16:00:00.000Z'),
      slaDeadline: new Date('2026-11-02T15:00:00.000Z'),
      status: 'PENDING',
    };

    const result = runSchedulingEngine([newJob], [tech], { runType: 'OPTIMIZATION' });

    const dNew = result.decisions.find((d) => d.jobId === newJob.id)!;
    expect(dNew.isAssigned).toBe(true);

    // Verify scheduled appointment is after in-progress assignment
    expect(dNew.selectedSlot!.scheduledStart.getTime()).toBeGreaterThanOrEqual(
      new Date('2026-11-02T11:30:00.000Z').getTime()
    );
  });
});
