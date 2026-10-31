import { config } from '../config';
import { Coordinates } from './scheduling.types';

export const EARTH_RADIUS_KM = 6371.0;
export const ROAD_NETWORK_DETOUR_FACTOR = 1.25; // Typical urban/suburban road network routing factor over Euclidean/Haversine line

/**
 * Validates that latitude and longitude represent valid geographical coordinates.
 */
export function validateCoordinates(lat: number, lon: number): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return false;
  }
  return lat >= -90.0 && lat <= 90.0 && lon >= -180.0 && lon <= 180.0;
}

/**
 * Converts degrees to radians.
 */
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180.0);
}

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the spherical Haversine formula.
 * 
 * Formula:
 * a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
 * c = 2 * atan2(√a, √(1-a))
 * distance = R * c
 * 
 * @param origin Start coordinates { latitude, longitude }
 * @param destination Destination coordinates { latitude, longitude }
 * @returns Great-circle distance in kilometers (rounded to 3 decimal places)
 */
export function calculateHaversineDistance(
  origin: Coordinates,
  destination: Coordinates
): number {
  if (!validateCoordinates(origin.latitude, origin.longitude)) {
    throw new Error(`Invalid origin coordinates: lat=${origin.latitude}, lon=${origin.longitude}`);
  }
  if (!validateCoordinates(destination.latitude, destination.longitude)) {
    throw new Error(`Invalid destination coordinates: lat=${destination.latitude}, lon=${destination.longitude}`);
  }

  // Identical coordinates
  if (
    origin.latitude === destination.latitude &&
    origin.longitude === destination.longitude
  ) {
    return 0.0;
  }

  const dLat = deg2rad(destination.latitude - origin.latitude);
  const dLon = deg2rad(destination.longitude - origin.longitude);

  const lat1 = deg2rad(origin.latitude);
  const lat2 = deg2rad(destination.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const rawKm = EARTH_RADIUS_KM * c;

  return Math.round(rawKm * 1000) / 1000;
}

/**
 * Computes estimated travel time in minutes based on Haversine distance,
 * a road network detour factor (1.25x), configurable average vehicle speed,
 * and an optional arrival prep/parking buffer.
 * 
 * Limitations of Straight-Line / Haversine Distance:
 * 1. Road Network Topology: Vehicles travel on physical street grids, highways, and bridges,
 *    not great-circle straight lines. We account for this via a 1.25x urban detour multiplier.
 * 2. Traffic Dynamic: Peak congestion, lane closures, and weather are not represented.
 * 3. Physical Barriers: Natural bodies of water (e.g. San Francisco Bay) require bridges.
 * 
 * @param origin Starting coordinates
 * @param destination Target appointment coordinates
 * @param speedKmh Optional override for average travel speed (defaults to env configuration: 45 km/h)
 * @param bufferMinutes Fixed parking, building security, and tool setup buffer (defaults to env configuration: 5 mins)
 * @returns Object containing travel distance in km and estimated duration in minutes
 */
export function calculateTravelEstimate(
  origin: Coordinates,
  destination: Coordinates,
  speedKmh = config.DEFAULT_TRAVEL_SPEED_KMH || 45,
  bufferMinutes = config.TRAVEL_BUFFER_MINUTES || 5
): { distanceKm: number; travelTimeMinutes: number } {
  if (speedKmh <= 0) {
    throw new Error(`Average travel speed must be greater than 0 km/h. Received: ${speedKmh}`);
  }

  const directDistanceKm = calculateHaversineDistance(origin, destination);

  // If identical location, no transit time needed
  if (directDistanceKm === 0) {
    return {
      distanceKm: 0.0,
      travelTimeMinutes: 0,
    };
  }

  // Adjusted distance accounting for street navigation
  const roadDistanceKm = directDistanceKm * ROAD_NETWORK_DETOUR_FACTOR;

  // Transit time in minutes: (distance / speed) * 60 + arrival buffer
  const rawMinutes = (roadDistanceKm / speedKmh) * 60;
  const travelTimeMinutes = Math.max(5, Math.ceil(rawMinutes) + bufferMinutes);

  return {
    distanceKm: Math.round(directDistanceKm * 100) / 100,
    travelTimeMinutes,
  };
}
