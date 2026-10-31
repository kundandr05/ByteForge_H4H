import { describe, it, expect } from 'vitest';
import {
  isValidShiftTime,
  parseShiftTime,
  shiftTimeToMinutes,
  calculateDurationMinutes,
  addMinutes,
  isTimeOverlap,
  isWithinShift,
} from '../src/utils/dateTime';

describe('Date & Time Utilities', () => {
  it('validates 24-hour shift times in "HH:mm" format', () => {
    expect(isValidShiftTime('08:00')).toBe(true);
    expect(isValidShiftTime('17:30')).toBe(true);
    expect(isValidShiftTime('00:00')).toBe(true);
    expect(isValidShiftTime('23:59')).toBe(true);

    expect(isValidShiftTime('8:00')).toBe(false);
    expect(isValidShiftTime('24:00')).toBe(false);
    expect(isValidShiftTime('12:60')).toBe(false);
    expect(isValidShiftTime('morning')).toBe(false);
  });

  it('parses shift times into hours and minutes', () => {
    expect(parseShiftTime('09:45')).toEqual({ hours: 9, minutes: 45 });
    expect(shiftTimeToMinutes('02:30')).toBe(150);
  });

  it('calculates duration in minutes accurately', () => {
    const start = '2026-10-30T08:00:00.000Z';
    const end = '2026-10-30T10:30:00.000Z';
    expect(calculateDurationMinutes(start, end)).toBe(150);
  });

  it('adds minutes to UTC date', () => {
    const start = new Date('2026-10-30T08:00:00.000Z');
    const result = addMinutes(start, 45);
    expect(result.toISOString()).toBe('2026-10-30T08:45:00.000Z');
  });

  it('detects overlapping time intervals', () => {
    // A: 09:00 - 11:00
    // B: 10:00 - 12:00 (overlaps)
    // C: 11:30 - 13:00 (no overlap with A)
    const startA = '2026-10-30T09:00:00.000Z';
    const endA = '2026-10-30T11:00:00.000Z';
    const startB = '2026-10-30T10:00:00.000Z';
    const endB = '2026-10-30T12:00:00.000Z';
    const startC = '2026-10-30T11:30:00.000Z';
    const endC = '2026-10-30T13:00:00.000Z';

    expect(isTimeOverlap(startA, endA, startB, endB)).toBe(true);
    expect(isTimeOverlap(startA, endA, startC, endC)).toBe(false);
  });

  it('validates whether a task interval falls within technician shift hours', () => {
    // Shift: 08:00 to 17:00 UTC
    const insideStart = '2026-10-30T09:00:00.000Z';
    const insideEnd = '2026-10-30T12:00:00.000Z';
    expect(isWithinShift(insideStart, insideEnd, '08:00', '17:00')).toBe(true);

    const outsideStart = '2026-10-30T07:00:00.000Z';
    const outsideEnd = '2026-10-30T10:00:00.000Z';
    expect(isWithinShift(outsideStart, outsideEnd, '08:00', '17:00')).toBe(false);
  });
});
