import {
  SeededPRNG,
  SKILLS,
  ZONE_CODES,
  sampleZoneCoordinates,
  SHIFT_PATTERNS,
} from './seed-helpers';

export interface SeedTechnicianData {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  serviceZones: string[];
  primaryZone: string;
  latitude: number;
  longitude: number;
  shiftStart: string;
  shiftEnd: string;
  availabilityStatus: string;
}

const TECHNICIAN_ROSTER = [
  { name: 'Marcus Vance', role: 'HVAC & Refrigeration Lead' },
  { name: 'Elena Rostova', role: 'Fiber Optics & Telecom Specialist' },
  { name: 'David Ortiz', role: 'High-Voltage Master Electrician' },
  { name: 'Aisha Patel', role: 'Industrial Mechanical Systems Tech' },
  { name: 'Liam Gallagher', role: 'Commercial Plumbing & Boiler Tech' },
  { name: 'Sofia Chen', role: 'Network Infrastructure Engineer' },
  { name: 'Carlos Mendez', role: 'Physical Security & Access Systems' },
  { name: 'Brianna Jackson', role: 'Field Hardware Diagnostic Specialist' },
  { name: 'Koji Tanaka', role: 'Software & SCADA Controller Tech' },
  { name: 'Rachel Green', role: 'General Facilities & PM Specialist' },
  { name: 'Tariq Al-Mansoor', role: 'Critical Power & Generator Tech' },
  { name: 'Hannah Schmidt', role: 'Data Center Systems Tech' },
  { name: 'Lucas Silva', role: 'Hydraulics & Pressure Valve Specialist' },
  { name: 'Devon Miller', role: 'HVAC Controls & Energy Management' },
  { name: 'Priya Sharma', role: 'Enterprise Security & CCTV Lead' },
  { name: 'Ethan Wright', role: 'Field Network & WAN Technician' },
  { name: 'Zoe Morales', role: 'Robotics & Mechanical Assembly Tech' },
  { name: 'Omar Farooq', role: 'Electrical Distribution Inspector' },
  { name: 'Grace Kim', role: 'Building Management Software Specialist' },
  { name: 'Mateo Rossi', role: 'Cleanroom & Medical Facilities Tech' },
  { name: 'Chloe Bennett', role: 'Industrial Cooling Systems Tech' },
  { name: 'Julian Hayes', role: 'Fire Alarm & Life Safety Tech' },
  { name: 'Amara Okafor', role: 'Telecommunications & Backbone Tech' },
  { name: 'Viktor Lindqvist', role: 'Heavy Mechanical Overhaul Lead' },
  { name: 'Isabella Duarte', role: 'Electrical Low-Voltage Systems' },
  { name: 'Nathaniel Cole', role: 'Piping & Water Treatment Systems' },
  { name: 'Leila Farzan', role: 'Smart Grid & Metering Technician' },
  { name: 'Gabriel Torres', role: 'Rapid Response Generalist' },
];

export function generateTechnicians(prng: SeededPRNG): SeedTechnicianData[] {
  return TECHNICIAN_ROSTER.map((person, index) => {
    // Generate clean email
    const emailName = person.name.toLowerCase().replace(/[^a-z]/g, '.');
    const email = `${emailName}@dispatchgrid.io`;
    const phone = `+1-555-${String(101 + index).padStart(4, '0')}`;

    // Assign primary home zone cyclically so all 5 zones have technicians
    const primaryZone = ZONE_CODES[index % ZONE_CODES.length];

    // Secondary zones (technicians cover 1 to 3 zones)
    const extraZoneCount = prng.int(0, 2);
    const otherZones = ZONE_CODES.filter((z) => z !== primaryZone);
    const assignedZones = [primaryZone, ...prng.sample(otherZones, extraZoneCount)];

    // Sample coordinates strictly within primary home zone
    const coords = sampleZoneCoordinates(primaryZone, prng);

    // Assign skills: mix of specialists (1-2 skills) and generalists (3-5 skills)
    let technicianSkills: string[];
    if (index % 3 === 0) {
      // Specialist (1-2 focused skills)
      const primarySkill = SKILLS[index % SKILLS.length];
      technicianSkills = [primarySkill];
      if (prng.next() > 0.5) {
        const secondary = prng.pick(SKILLS.filter((s) => s !== primarySkill));
        technicianSkills.push(secondary);
      }
    } else {
      // Broad multi-skilled technician (3 to 5 skills)
      const skillCount = prng.int(3, 5);
      technicianSkills = prng.sample([...SKILLS], skillCount);
    }

    // Shift selection
    const shift = SHIFT_PATTERNS[index % SHIFT_PATTERNS.length];

    // Availability distribution (mostly AVAILABLE, some ON_SHIFT / UNAVAILABLE)
    let availabilityStatus = 'AVAILABLE';
    if (index === 2) availabilityStatus = 'ON_SHIFT';
    else if (index === 7) availabilityStatus = 'ON_SHIFT';
    else if (index === 14) availabilityStatus = 'ON_SHIFT';
    else if (index === 18) availabilityStatus = 'UNAVAILABLE';
    else if (index === 23) availabilityStatus = 'OFF_DUTY';

    return {
      name: person.name,
      email,
      phone,
      skills: technicianSkills,
      serviceZones: assignedZones,
      primaryZone,
      latitude: coords.latitude,
      longitude: coords.longitude,
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
      availabilityStatus,
    };
  });
}
