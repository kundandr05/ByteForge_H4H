/**
 * Seed Utilities & Deterministic Random Number Generator for DispatchGrid
 */

export class SeededPRNG {
  private s: number;

  constructor(seed = 0x1337beef) {
    this.s = seed;
  }

  /**
   * Returns a deterministic float between [0, 1)
   */
  public next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a float in range [min, max)
   */
  public float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns an integer in range [min, max] inclusive
   */
  public int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  /**
   * Selects one element from array
   */
  public pick<T>(arr: T[]): T {
    if (arr.length === 0) throw new Error('Cannot pick from empty array');
    return arr[this.int(0, arr.length - 1)];
  }

  /**
   * Samples k distinct items from array without replacement
   */
  public sample<T>(arr: T[], count: number): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(count, arr.length));
  }

  /**
   * Shuffles an array in place deterministically
   */
  public shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// -------------------------------------------------------------
// Core Skill Taxonomy (10 Categories)
// -------------------------------------------------------------
export const SKILLS = [
  'ELECTRICAL',
  'PLUMBING',
  'HVAC',
  'NETWORKING',
  'HARDWARE_REPAIR',
  'SOFTWARE_SUPPORT',
  'MECHANICAL',
  'SECURITY_SYSTEMS',
  'FIBER_OPTICS',
  'GENERAL_MAINTENANCE',
] as const;

export type Skill = (typeof SKILLS)[number];

// -------------------------------------------------------------
// Service Zones with Realistic Regional Bounding Boxes
// (San Francisco Bay Metro Region)
// -------------------------------------------------------------
export interface ServiceZoneConfig {
  code: string;
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
}

export const SERVICE_ZONES: Record<string, ServiceZoneConfig> = {
  ZONE_CENTRAL: {
    code: 'ZONE_CENTRAL',
    name: 'San Francisco Downtown & Financial District',
    minLat: 37.770,
    maxLat: 37.795,
    minLng: -122.425,
    maxLng: -122.390,
    centerLat: 37.7825,
    centerLng: -122.4075,
  },
  ZONE_NORTH: {
    code: 'ZONE_NORTH',
    name: 'North Bay & Marin Commercial Corridor',
    minLat: 37.930,
    maxLat: 37.990,
    minLng: -122.560,
    maxLng: -122.490,
    centerLat: 37.960,
    centerLng: -122.525,
  },
  ZONE_SOUTH: {
    code: 'ZONE_SOUTH',
    name: 'Peninsula & Silicon Valley Tech Hub',
    minLat: 37.360,
    maxLat: 37.440,
    minLng: -122.180,
    maxLng: -122.090,
    centerLat: 37.400,
    centerLng: -122.135,
  },
  ZONE_EAST: {
    code: 'ZONE_EAST',
    name: 'East Bay & Oakland Industrial Logistics',
    minLat: 37.780,
    maxLat: 37.840,
    minLng: -122.280,
    maxLng: -122.200,
    centerLat: 37.810,
    centerLng: -122.240,
  },
  ZONE_WEST: {
    code: 'ZONE_WEST',
    name: 'Pacific Coastal & Outer Sunset District',
    minLat: 37.720,
    maxLat: 37.770,
    minLng: -122.510,
    maxLng: -122.460,
    centerLat: 37.745,
    centerLng: -122.485,
  },
};

export const ZONE_CODES = Object.keys(SERVICE_ZONES);

/**
 * Samples a random coordinate pair strictly within the designated zone bounding box
 */
export function sampleZoneCoordinates(
  zoneCode: string,
  prng: SeededPRNG
): { latitude: number; longitude: number } {
  const zone = SERVICE_ZONES[zoneCode] || SERVICE_ZONES.ZONE_CENTRAL;
  const latitude = Math.round(prng.float(zone.minLat, zone.maxLat) * 1000000) / 1000000;
  const longitude = Math.round(prng.float(zone.minLng, zone.maxLng) * 1000000) / 1000000;
  return { latitude, longitude };
}

// -------------------------------------------------------------
// Standard Shift Templates
// -------------------------------------------------------------
export const SHIFT_PATTERNS = [
  { shiftStart: '06:30', shiftEnd: '15:00', label: 'Early Morning Shift' },
  { shiftStart: '08:00', shiftEnd: '16:30', label: 'Standard Day Shift A' },
  { shiftStart: '08:30', shiftEnd: '17:00', label: 'Standard Day Shift B' },
  { shiftStart: '09:00', shiftEnd: '17:30', label: 'Mid-Morning Shift' },
  { shiftStart: '12:30', shiftEnd: '21:00', label: 'Evening Shift' },
];

// Base simulation date: Monday, Nov 2, 2026
export const BASE_DATE = '2026-11-02';

/**
 * Creates a UTC Date on the base simulation day with specified hours and minutes.
 */
export function createSimDate(
  timeStr: string,
  dayOffset = 0
): Date {
  const [hours, minutes] = timeStr.split(':').map((s) => parseInt(s, 10));
  const base = new Date(`${BASE_DATE}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  base.setUTCHours(hours, minutes, 0, 0);
  return base;
}
