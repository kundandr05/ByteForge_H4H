import {
  SeededPRNG,
  SKILLS,
  ZONE_CODES,
  sampleZoneCoordinates,
  createSimDate,
} from './seed-helpers';
import { SeedJobData } from './scenario-seeder';

const CUSTOMER_PREFIXES = [
  'Pinnacle', 'Apex', 'Horizon', 'Beacon', 'Nexus', 'Vertex', 'Meridian', 'Vanguard',
  'Summit', 'Atlas', 'Crestview', 'Sterling', 'Cascade', 'Omni', 'Trident', 'Bayside',
  'Pacific', 'Silicon', 'Redwood', 'Golden Gate', 'Embarcadero', 'Mission', 'Presidio',
  'Marina', 'Civic', 'Metro', 'Aero', 'Quantum', 'BioHealth', 'Sutter'
];

const CUSTOMER_TYPES = [
  'Data Center', 'Logistics Hub', 'Medical Plaza', 'Research Labs', 'Financial Center',
  'Corporate Headquarters', 'Commercial Tower', 'Distribution Center', 'Retail Center',
  'Transit Facility', 'Biotech Campus', 'Hospital & Surgery Center', 'Manufacturing Depot',
  'Educational Campus', 'Telecommunications Center', 'Hotels & Suites'
];

const JOB_TASKS: Record<string, string[]> = {
  ELECTRICAL: [
    'Emergency switchgear circuit breaker replacement',
    'UPS battery backup system voltage calibration',
    'Main electrical distribution panel thermal imaging & inspection',
    'Backup emergency generator automatic transfer switch service',
    'Variable frequency drive (VFD) motor controller diagnostics',
  ],
  PLUMBING: [
    'Commercial booster pump pressure valve overhaul',
    'Backflow preventer annual certification & rebuild',
    'Central boiler domestic hot water heat exchanger descaling',
    'Main sewer lift station pump impeller clearing & testing',
    'Chilled water loop hydraulic balancing valve adjustment',
  ],
  HVAC: [
    'Roof-mounted package unit compressor refrigerant recharge',
    'Cleanroom HEPA filtration air handler differential pressure check',
    'Chilled water cooling tower fan motor and belt replacement',
    'Building automation pneumatic damper actuator troubleshooting',
    'Precision server room computer room air conditioning (CRAC) service',
  ],
  NETWORKING: [
    'Core distribution fiber switch transceiver replacement',
    'MDF rack cable cleanup and patch panel certification',
    'Wireless access point deployment & PoE controller provisioning',
    'Edge firewall hardware gateway failover testing',
    'Structured CAT6A cabling termination and fluke testing',
  ],
  HARDWARE_REPAIR: [
    'Critical industrial touch panel HMI screen replacement',
    'Server power supply redundancy fault diagnosis',
    'Security access card reader hardware terminal swap',
    'Barcode scanner terminal and dock station repair',
    'PLC logic controller modular card expansion and wiring',
  ],
  SOFTWARE_SUPPORT: [
    'Building management system (BMS) telemetry gateway reboot',
    'Access control server firmware patch and database verification',
    'Energy monitoring dashboard sensor MQTT communication fix',
    'SCADA controller network protocol configuration',
    'HVAC digital direct controller (DDC) logic setpoint tuning',
  ],
  MECHANICAL: [
    'Exhaust ventilation fan bearing greasing and laser alignment',
    'Loading dock hydraulic leveler cylinder seal replacement',
    'Commercial elevator motor brake inspection assistance',
    'Conveyor belt tensioner and drive gearbox maintenance',
    'Centrifugal water pump mechanical seal replacement',
  ],
  SECURITY_SYSTEMS: [
    'Perimeter PTZ infrared surveillance camera realignment',
    'Biometric turnstile entry optical sensor recalibration',
    'Intrusion detection alarm beam sensor testing',
    'Electronic magnetic door lock power supply fault isolation',
    'CCTV NVR storage array drive replacement & RAID rebuild',
  ],
  FIBER_OPTICS: [
    'Single-mode fiber backbone fusion splicing and OTDR testing',
    'Fiber distribution panel LC connector cleaning & scoping',
    'Underground conduit fiber pull and patch panel breakout',
    'Multi-mode riser backbone attenuation loss measurement',
    'Optical multiplexer add-drop filter verification',
  ],
  GENERAL_MAINTENANCE: [
    'Quarterly facility preventative maintenance checklist execution',
    'Emergency lighting and exit sign battery load testing',
    'Fire damper mechanical drop and reset testing',
    'Filter replacement across all building air handling units',
    'Equipment room acoustic dampening and seal inspection',
  ],
};

export function generateNormalJobs(
  prng: SeededPRNG,
  count = 135
): SeedJobData[] {
  const jobs: SeedJobData[] = [];

  for (let i = 0; i < count; i++) {
    const prefix = prng.pick(CUSTOMER_PREFIXES);
    const type = prng.pick(CUSTOMER_TYPES);
    const customerName = `${prefix} ${type} #${prng.int(10, 99)}`;

    // Pick 1 primary skill, and occasionally 1-2 secondary skills
    const primarySkill = prng.pick([...SKILLS]);
    const requiredSkills = [primarySkill];
    if (prng.next() > 0.65) {
      const otherSkill = prng.pick(SKILLS.filter((s) => s !== primarySkill));
      requiredSkills.push(otherSkill);
    }
    if (prng.next() > 0.85) {
      const thirdSkill = prng.pick(SKILLS.filter((s) => !requiredSkills.includes(s)));
      requiredSkills.push(thirdSkill);
    }

    // Pick task description matching primary skill
    const taskOptions = JOB_TASKS[primarySkill] || JOB_TASKS.GENERAL_MAINTENANCE;
    const description = `[SCENARIO_A: NORMAL_OPERATIONS] ${prng.pick(taskOptions)}`;

    // Service zone distribution
    const serviceZone = ZONE_CODES[i % ZONE_CODES.length];
    const coords = sampleZoneCoordinates(serviceZone, prng);

    // Realistic duration distribution:
    // Small (15-30m): 20%
    // Medium (30-90m): 50%
    // Large (90-180m): 20%
    // Complex (180-240m): 10%
    const durationRoll = prng.next();
    let estimatedDuration: number;
    if (durationRoll < 0.20) {
      estimatedDuration = prng.int(15, 30);
    } else if (durationRoll < 0.70) {
      estimatedDuration = prng.int(35, 90);
    } else if (durationRoll < 0.90) {
      estimatedDuration = prng.int(95, 180);
    } else {
      estimatedDuration = prng.int(185, 240);
    }

    // Realistic priority distribution:
    // LOW: ~35%
    // MEDIUM: ~42%
    // HIGH: ~18%
    // CRITICAL: ~5%
    const priorityRoll = prng.next();
    let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (priorityRoll < 0.35) {
      priority = 'LOW';
    } else if (priorityRoll < 0.77) {
      priority = 'MEDIUM';
    } else if (priorityRoll < 0.95) {
      priority = 'HIGH';
    } else {
      priority = 'CRITICAL';
    }

    // Generate appointment time window on simulation date
    // Morning (08:00 - 13:00), Afternoon (12:00 - 17:30), or Full-day (08:30 - 17:00)
    const windowType = prng.int(1, 3);
    let earliestHour: number;
    let latestHour: number;

    if (windowType === 1) {
      // Morning window
      earliestHour = prng.int(7, 9);
      latestHour = prng.int(12, 14);
    } else if (windowType === 2) {
      // Afternoon window
      earliestHour = prng.int(12, 13);
      latestHour = prng.int(17, 19);
    } else {
      // Standard full day window
      earliestHour = 8;
      latestHour = 17;
    }

    const earliestStart = createSimDate(
      `${String(earliestHour).padStart(2, '0')}:${prng.pick(['00', '15', '30'])}`
    );
    const latestEnd = createSimDate(
      `${String(latestHour).padStart(2, '0')}:${prng.pick(['00', '30', '45'])}`
    );

    // SLA deadline is set within the window, typically before or at latestEnd
    const latestMs = latestEnd.getTime();
    const earliestMs = earliestStart.getTime();
    const durationMs = estimatedDuration * 60 * 1000;
    const slaMs = Math.min(latestMs, earliestMs + durationMs + prng.int(30, 180) * 60 * 1000);
    const slaDeadline = new Date(slaMs);

    jobs.push({
      customerName,
      description,
      requiredSkills,
      priority,
      estimatedDuration,
      latitude: coords.latitude,
      longitude: coords.longitude,
      serviceZone,
      earliestStart,
      latestEnd,
      slaDeadline,
      status: 'PENDING',
      scenarioTag: 'SCENARIO_A_NORMAL',
    });
  }

  return jobs;
}
