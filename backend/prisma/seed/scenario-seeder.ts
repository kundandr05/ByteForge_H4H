import {
  SeededPRNG,
  sampleZoneCoordinates,
  createSimDate,
} from './seed-helpers';

export interface SeedJobData {
  customerName: string;
  description: string;
  requiredSkills: string[];
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedDuration: number;
  latitude: number;
  longitude: number;
  serviceZone: string;
  earliestStart: Date;
  latestEnd: Date;
  slaDeadline: Date;
  status: 'PENDING';
  scenarioTag?: string;
}

export interface SeedUnavailabilityData {
  technicianEmail: string;
  startTime: Date;
  endTime: Date;
  reason: string;
}

export function generateScenarios(prng: SeededPRNG): {
  scenarioJobs: SeedJobData[];
  unavailabilities: SeedUnavailabilityData[];
} {
  const jobs: SeedJobData[] = [];
  const unavailabilities: SeedUnavailabilityData[] = [];

  // =========================================================================
  // SCENARIO B: HIGH PRIORITY COMPETITION
  // 6 Critical & High priority jobs in ZONE_CENTRAL overlapping between 09:00 - 12:00
  // competing for certified electrical & HVAC specialists
  // =========================================================================
  const scenarioBConfigs = [
    { customer: 'FinTech Tower SF', desc: 'Core UPS power inverter alarm', skill: 'ELECTRICAL', priority: 'CRITICAL' as const },
    { customer: 'Bay Area Exchange', desc: 'Main trading floor server room AC trip', skill: 'HVAC', priority: 'CRITICAL' as const },
    { customer: 'Mission Data Colocation', desc: 'Backup diesel generator transfer switch test', skill: 'ELECTRICAL', priority: 'HIGH' as const },
    { customer: 'Pacific Heights Surgery Center', desc: 'Isolation ward negative air pressure drop', skill: 'HVAC', priority: 'CRITICAL' as const },
    { customer: 'Transbay Transit Center', desc: 'Substation circuit breaker diagnostic', skill: 'ELECTRICAL', priority: 'HIGH' as const },
    { customer: 'Embarcadero Plaza Hotel', desc: 'Central chiller plant pressure spike', skill: 'HVAC', priority: 'HIGH' as const },
  ];

  for (const b of scenarioBConfigs) {
    const coords = sampleZoneCoordinates('ZONE_CENTRAL', prng);
    jobs.push({
      customerName: b.customer,
      description: `[SCENARIO_B: HIGH_PRIORITY_COMPETITION] ${b.desc}`,
      requiredSkills: [b.skill],
      priority: b.priority,
      estimatedDuration: prng.int(90, 150),
      latitude: coords.latitude,
      longitude: coords.longitude,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: createSimDate('09:00'),
      latestEnd: createSimDate('12:30'),
      slaDeadline: createSimDate('12:00'),
      status: 'PENDING',
      scenarioTag: 'SCENARIO_B_COMPETITION',
    });
  }

  // =========================================================================
  // SCENARIO C: TECHNICIAN UNAVAILABILITY
  // 4 Technicians with scheduled out-of-service periods during peak hours
  // =========================================================================
  unavailabilities.push(
    {
      technicianEmail: 'marcus.vance@dispatchgrid.io',
      startTime: createSimDate('10:00'),
      endTime: createSimDate('14:00'),
      reason: '[SCENARIO_C] Vehicle transmission maintenance at service depot',
    },
    {
      technicianEmail: 'david.ortiz@dispatchgrid.io',
      startTime: createSimDate('08:30'),
      endTime: createSimDate('12:30'),
      reason: '[SCENARIO_C] Mandatory Cal/OSHA high-voltage safety recertification',
    },
    {
      technicianEmail: 'elena.rostova@dispatchgrid.io',
      startTime: createSimDate('13:00'),
      endTime: createSimDate('17:00'),
      reason: '[SCENARIO_C] Medical appointment - scheduled absence',
    },
    {
      technicianEmail: 'aisha.patel@dispatchgrid.io',
      startTime: createSimDate('11:00'),
      endTime: createSimDate('15:00'),
      reason: '[SCENARIO_C] Required quarterly tooling calibration audit',
    }
  );

  // Conflicting jobs scheduled directly during the technicians' unavailable windows
  const scenarioCJobs = [
    { customer: 'Civic Center Library', desc: 'HVAC chiller compressor bearing inspection', skill: 'HVAC' },
    { customer: 'Federal Reserve Branch', desc: 'Substation transformer dielectric check', skill: 'ELECTRICAL' },
    { customer: 'Bay Telecom Central', desc: 'Underground conduit fiber splice inspection', skill: 'FIBER_OPTICS' },
  ];

  for (const c of scenarioCJobs) {
    const coords = sampleZoneCoordinates('ZONE_CENTRAL', prng);
    jobs.push({
      customerName: c.customer,
      description: `[SCENARIO_C: UNAVAILABILITY_CONFLICT] ${c.desc}`,
      requiredSkills: [c.skill],
      priority: 'HIGH',
      estimatedDuration: 90,
      latitude: coords.latitude,
      longitude: coords.longitude,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: createSimDate('10:30'),
      latestEnd: createSimDate('13:30'),
      slaDeadline: createSimDate('13:00'),
      status: 'PENDING',
      scenarioTag: 'SCENARIO_C_UNAVAILABILITY',
    });
  }

  // =========================================================================
  // SCENARIO D: TRAVEL TIME CONFLICTS
  // Jobs located far apart at opposite ends of service zones with tight margins
  // =========================================================================
  const extremeCoordsNorth = { latitude: 37.9890, longitude: -122.5550 }; // Far NW corner of North Bay
  const extremeCoordsSouth = { latitude: 37.3620, longitude: -122.0950 }; // Far SE corner of Silicon Valley

  jobs.push(
    {
      customerName: 'Marin Peak Radio Tower',
      description: '[SCENARIO_D: TRAVEL_TIME_CONFLICT] Remote ridge telecom antenna amplifier reset',
      requiredSkills: ['NETWORKING', 'HARDWARE_REPAIR'],
      priority: 'HIGH',
      estimatedDuration: 120,
      latitude: extremeCoordsNorth.latitude,
      longitude: extremeCoordsNorth.longitude,
      serviceZone: 'ZONE_NORTH',
      earliestStart: createSimDate('09:00'),
      latestEnd: createSimDate('12:00'),
      slaDeadline: createSimDate('11:30'),
      status: 'PENDING',
      scenarioTag: 'SCENARIO_D_TRAVEL_CONFLICT',
    },
    {
      customerName: 'Cupertino Tech Park Lab',
      description: '[SCENARIO_D: TRAVEL_TIME_CONFLICT] Cleanroom server rack fiber switch replacement',
      requiredSkills: ['NETWORKING', 'FIBER_OPTICS'],
      priority: 'HIGH',
      estimatedDuration: 120,
      latitude: extremeCoordsSouth.latitude,
      longitude: extremeCoordsSouth.longitude,
      serviceZone: 'ZONE_SOUTH',
      earliestStart: createSimDate('12:30'), // Only 30 minutes after north job ends (physically impossible drive)
      latestEnd: createSimDate('15:30'),
      slaDeadline: createSimDate('15:00'),
      status: 'PENDING',
      scenarioTag: 'SCENARIO_D_TRAVEL_CONFLICT',
    }
  );

  // =========================================================================
  // SCENARIO E: MISSING SKILLS
  // Jobs requiring rare, unfulfillable skill combinations that no tech has in zone
  // =========================================================================
  jobs.push(
    {
      customerName: 'BioQuantum Research Facility',
      description: '[SCENARIO_E: MISSING_SKILLS] Cryogenic electron microscope fiber-optical vacuum pump overhaul',
      requiredSkills: ['FIBER_OPTICS', 'SECURITY_SYSTEMS', 'PLUMBING', 'MECHANICAL'],
      priority: 'HIGH',
      estimatedDuration: 180,
      latitude: 37.7450,
      longitude: -122.4850,
      serviceZone: 'ZONE_WEST', // West zone techs do not possess all 4 rare skills simultaneously
      earliestStart: createSimDate('08:30'),
      latestEnd: createSimDate('16:00'),
      slaDeadline: createSimDate('15:00'),
      status: 'PENDING',
      scenarioTag: 'SCENARIO_E_MISSING_SKILLS',
    },
    {
      customerName: 'Pacific Marine Deepsea Telemetry',
      description: '[SCENARIO_E: MISSING_SKILLS] Subsea acoustic sonar transducer firmware interface calibration',
      requiredSkills: ['SOFTWARE_SUPPORT', 'MECHANICAL', 'FIBER_OPTICS', 'SECURITY_SYSTEMS'],
      priority: 'MEDIUM',
      estimatedDuration: 150,
      latitude: 37.7320,
      longitude: -122.5020,
      serviceZone: 'ZONE_WEST',
      earliestStart: createSimDate('09:00'),
      latestEnd: createSimDate('15:00'),
      slaDeadline: createSimDate('14:00'),
      status: 'PENDING',
      scenarioTag: 'SCENARIO_E_MISSING_SKILLS',
    }
  );

  // =========================================================================
  // SCENARIO F: IMPOSSIBLE DEADLINES
  // Jobs whose time windows or deadlines make physical completion mathematically impossible
  // (e.g. Duration is 180 mins, but window is only 60 mins)
  // =========================================================================
  const coordsF1 = sampleZoneCoordinates('ZONE_CENTRAL', prng);
  jobs.push({
    customerName: 'Chronos Logistics Terminal',
    description: '[SCENARIO_F: IMPOSSIBLE_DEADLINES] 4-hour commercial chiller teardown inside 60-min window',
    requiredSkills: ['HVAC', 'MECHANICAL'],
    priority: 'HIGH',
    estimatedDuration: 240, // 4 hours
    latitude: coordsF1.latitude,
    longitude: coordsF1.longitude,
    serviceZone: 'ZONE_CENTRAL',
    earliestStart: createSimDate('10:00'),
    latestEnd: createSimDate('11:00'), // Window is only 60 minutes!
    slaDeadline: createSimDate('10:45'),
    status: 'PENDING',
    scenarioTag: 'SCENARIO_F_IMPOSSIBLE_DEADLINE',
  });

  const coordsF2 = sampleZoneCoordinates('ZONE_EAST', prng);
  jobs.push({
    customerName: 'Port of Oakland Berth 22',
    description: '[SCENARIO_F: IMPOSSIBLE_DEADLINES] High-voltage crane cable diagnostic with expired deadline',
    requiredSkills: ['ELECTRICAL'],
    priority: 'CRITICAL',
    estimatedDuration: 120, // 2 hours
    latitude: coordsF2.latitude,
    longitude: coordsF2.longitude,
    serviceZone: 'ZONE_EAST',
    earliestStart: createSimDate('14:00'),
    latestEnd: createSimDate('14:45'), // Window is 45 minutes!
    slaDeadline: createSimDate('14:30'),
    status: 'PENDING',
    scenarioTag: 'SCENARIO_F_IMPOSSIBLE_DEADLINE',
  });

  // =========================================================================
  // SCENARIO G: OVERLOADED TECHNICIANS
  // 12 jobs in ZONE_WEST where only 2 technicians are stationed,
  // creating guaranteed shift hour deficit
  // =========================================================================
  for (let i = 1; i <= 10; i++) {
    const coords = sampleZoneCoordinates('ZONE_WEST', prng);
    jobs.push({
      customerName: `Sunset District Business ${i}`,
      description: `[SCENARIO_G: OVERLOADED_ZONE] Routine preventive maintenance call #${i}`,
      requiredSkills: ['GENERAL_MAINTENANCE'],
      priority: i % 2 === 0 ? 'HIGH' : 'MEDIUM',
      estimatedDuration: prng.int(90, 150),
      latitude: coords.latitude,
      longitude: coords.longitude,
      serviceZone: 'ZONE_WEST',
      earliestStart: createSimDate('08:30'),
      latestEnd: createSimDate('17:00'),
      slaDeadline: createSimDate('16:30'),
      status: 'PENDING',
      scenarioTag: 'SCENARIO_G_OVERLOADED_ZONE',
    });
  }

  // =========================================================================
  // SCENARIO H: URGENT JOB ARRIVAL
  // Critical break-in jobs for disruption engine simulation
  // =========================================================================
  for (let i = 1; i <= 5; i++) {
    const zone = prng.pick(['ZONE_CENTRAL', 'ZONE_SOUTH', 'ZONE_EAST']);
    const coords = sampleZoneCoordinates(zone, prng);
    jobs.push({
      customerName: `Emergency Incident #${i}`,
      description: `[SCENARIO_H: URGENT_JOB_ARRIVAL] Sudden active water line rupture and electrical hazard #${i}`,
      requiredSkills: ['PLUMBING', 'ELECTRICAL'],
      priority: 'CRITICAL',
      estimatedDuration: prng.int(45, 75),
      latitude: coords.latitude,
      longitude: coords.longitude,
      serviceZone: zone,
      earliestStart: createSimDate('11:00'),
      latestEnd: createSimDate('13:00'),
      slaDeadline: createSimDate('12:15'),
      status: 'PENDING',
      scenarioTag: 'SCENARIO_H_URGENT_ARRIVAL',
    });
  }

  return { scenarioJobs: jobs, unavailabilities };
}
