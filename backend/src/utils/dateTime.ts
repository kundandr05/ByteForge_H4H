/**
 * Date and Time Utilities for DispatchGrid
 * 
 * Standardized on ISO-8601 UTC timestamps for all persisted scheduling models.
 * Daily recurring shifts use 24-hour UTC "HH:mm" string format.
 */

export const SHIFT_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Validates if a string is a valid 24-hour time in "HH:mm" format (e.g., "08:30", "17:00").
 */
export function isValidShiftTime(timeStr: string): boolean {
  return SHIFT_TIME_REGEX.test(timeStr);
}

/**
 * Parses "HH:mm" format into hours and minutes integers.
 */
export function parseShiftTime(timeStr: string): { hours: number; minutes: number } {
  if (!isValidShiftTime(timeStr)) {
    throw new Error(`Invalid shift time format: "${timeStr}". Expected "HH:mm" (24-hour).`);
  }
  const [hours, minutes] = timeStr.split(':').map((s) => parseInt(s, 10));
  return { hours, minutes };
}

/**
 * Converts shift time string ("HH:mm") to total minutes from midnight (0 to 1439).
 */
export function shiftTimeToMinutes(timeStr: string): number {
  const { hours, minutes } = parseShiftTime(timeStr);
  return hours * 60 + minutes;
}

/**
 * Formats a Date object to ISO-8601 UTC string.
 */
export function toISOUTC(date: Date): string {
  return date.toISOString();
}

/**
 * Parses an ISO-8601 string or Date to a validated Date object.
 */
export function parseUTC(input: string | Date): Date {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(input)}`);
  }
  return date;
}

/**
 * Calculates duration in minutes between two timestamps.
 */
export function calculateDurationMinutes(start: Date | string, end: Date | string): number {
  const startDate = parseUTC(start);
  const endDate = parseUTC(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.round(diffMs / (1000 * 60));
}

/**
 * Adds minutes to a Date object, returning a new Date instance in UTC.
 */
export function addMinutes(date: Date | string, minutes: number): Date {
  const base = parseUTC(date);
  return new Date(base.getTime() + minutes * 60 * 1000);
}

/**
 * Determines whether two time intervals overlap.
 * Assumes start < end for both intervals.
 */
export function isTimeOverlap(
  startA: Date | string,
  endA: Date | string,
  startB: Date | string,
  endB: Date | string
): boolean {
  const sA = parseUTC(startA).getTime();
  const eA = parseUTC(endA).getTime();
  const sB = parseUTC(startB).getTime();
  const eB = parseUTC(endB).getTime();

  return sA < eB && sB < eA;
}

/**
 * Checks if a scheduled start & end interval falls within a technician's daily shift hours.
 * For overnight shifts (e.g. 22:00 to 06:00), handles midnight wrap.
 */
export function isWithinShift(
  scheduledStart: Date | string,
  scheduledEnd: Date | string,
  shiftStart: string,
  shiftEnd: string
): boolean {
  const start = parseUTC(scheduledStart);
  const end = parseUTC(scheduledEnd);

  const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
  const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes();

  const shiftStartMin = shiftTimeToMinutes(shiftStart);
  const shiftEndMin = shiftTimeToMinutes(shiftEnd);

  // Standard daytime shift (e.g. 08:00 to 17:00)
  if (shiftStartMin <= shiftEndMin) {
    return startMinutes >= shiftStartMin && endMinutes <= shiftEndMin;
  }

  // Overnight shift (e.g. 22:00 to 06:00 next day)
  return (
    (startMinutes >= shiftStartMin || startMinutes <= shiftEndMin) &&
    (endMinutes >= shiftStartMin || endMinutes <= shiftEndMin)
  );
}
