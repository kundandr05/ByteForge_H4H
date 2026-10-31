import { describe, it, expect } from 'vitest';
import {
  jobCreateSchema,
  jobUpdateSchema,
  jobQuerySchema,
  technicianCreateSchema,
  technicianUpdateSchema,
  technicianQuerySchema,
  validateJobStatusTransition,
  JobStatus,
  ALLOWED_JOB_TRANSITIONS,
} from '../src/validators/schemas';
import { AppError } from '../src/utils/appError';

describe('Phase 11: API Input Validation, Security, and Boundary Verification', () => {
  // -------------------------------------------------------------
  // 1. Coordinate Boundaries
  // -------------------------------------------------------------
  describe('Geographic Coordinate Validation', () => {
    it('accepts valid latitude and longitude coordinates', () => {
      const validJob = {
        customerName: 'Valid Location Customer',
        description: 'Standard repair',
        requiredSkills: ['HVAC'],
        estimatedDuration: 60,
        latitude: 37.7749,
        longitude: -122.4194,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: '2026-11-02T08:00:00.000Z',
        latestEnd: '2026-11-02T17:00:00.000Z',
        slaDeadline: '2026-11-02T16:00:00.000Z',
      };

      const result = jobCreateSchema.safeParse(validJob);
      expect(result.success).toBe(true);
    });

    it('rejects latitude outside [-90, 90]', () => {
      const invalidLatJob = {
        customerName: 'Invalid Lat',
        description: 'Out of bounds north',
        requiredSkills: ['HVAC'],
        estimatedDuration: 60,
        latitude: 91.5, // > 90
        longitude: -122.4194,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: '2026-11-02T08:00:00.000Z',
        latestEnd: '2026-11-02T17:00:00.000Z',
        slaDeadline: '2026-11-02T16:00:00.000Z',
      };

      const result = jobCreateSchema.safeParse(invalidLatJob);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some((e) => e.path.includes('latitude'))).toBe(true);
      }
    });

    it('rejects longitude outside [-180, 180]', () => {
      const invalidLonJob = {
        customerName: 'Invalid Lon',
        description: 'Out of bounds east',
        requiredSkills: ['HVAC'],
        estimatedDuration: 60,
        latitude: 37.7749,
        longitude: 185.0, // > 180
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: '2026-11-02T08:00:00.000Z',
        latestEnd: '2026-11-02T17:00:00.000Z',
        slaDeadline: '2026-11-02T16:00:00.000Z',
      };

      const result = jobCreateSchema.safeParse(invalidLonJob);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some((e) => e.path.includes('longitude'))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------
  // 2. Date and Time Window Boundary Conditions
  // -------------------------------------------------------------
  describe('Date & Time Window Validation', () => {
    it('rejects jobs where earliestStart is equal to or after latestEnd', () => {
      const invertedJob = {
        customerName: 'Time Traveler',
        description: 'End before start',
        requiredSkills: ['HVAC'],
        estimatedDuration: 60,
        latitude: 37.7749,
        longitude: -122.4194,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: '2026-11-02T17:00:00.000Z',
        latestEnd: '2026-11-02T08:00:00.000Z', // Inverted
        slaDeadline: '2026-11-02T18:00:00.000Z',
      };

      const result = jobCreateSchema.safeParse(invertedJob);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some((e) => e.path.includes('latestEnd'))).toBe(true);
      }
    });

    it('rejects jobs where slaDeadline is before earliestStart', () => {
      const expiredSlaJob = {
        customerName: 'Past SLA',
        description: 'SLA earlier than earliest window',
        requiredSkills: ['HVAC'],
        estimatedDuration: 60,
        latitude: 37.7749,
        longitude: -122.4194,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: '2026-11-02T10:00:00.000Z',
        latestEnd: '2026-11-02T17:00:00.000Z',
        slaDeadline: '2026-11-02T09:00:00.000Z', // Before earliestStart
      };

      const result = jobCreateSchema.safeParse(expiredSlaJob);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some((e) => e.path.includes('slaDeadline'))).toBe(true);
      }
    });

    it('rejects invalid non-date strings for timestamps', () => {
      const corruptedDateJob = {
        customerName: 'Corrupted Date',
        description: 'Garbage date string',
        requiredSkills: ['HVAC'],
        estimatedDuration: 60,
        latitude: 37.7749,
        longitude: -122.4194,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: 'NOT_A_VALID_DATE_STRING',
        latestEnd: '2026-11-02T17:00:00.000Z',
        slaDeadline: '2026-11-02T16:00:00.000Z',
      };

      const result = jobCreateSchema.safeParse(corruptedDateJob);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 3. Shift Time Validation
  // -------------------------------------------------------------
  describe('Technician Shift Time Constraints', () => {
    it('rejects non-24h formatted shift time (e.g. "8:00" without leading zero)', () => {
      const invalidShiftTech = {
        name: 'Single Digit Hour',
        email: 'single@dispatchgrid.io',
        phone: '+1-555-0199',
        skills: ['HVAC'],
        serviceZones: ['ZONE_CENTRAL'],
        latitude: 37.77,
        longitude: -122.41,
        shiftStart: '8:00', // Non-compliant regex
        shiftEnd: '17:00',
      };

      const result = technicianCreateSchema.safeParse(invalidShiftTech);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some((e) => e.path.includes('shiftStart'))).toBe(true);
      }
    });

    it('rejects identical shiftStart and shiftEnd', () => {
      const zeroLengthShiftTech = {
        name: 'Zero Shift',
        email: 'zero@dispatchgrid.io',
        phone: '+1-555-0198',
        skills: ['HVAC'],
        serviceZones: ['ZONE_CENTRAL'],
        latitude: 37.77,
        longitude: -122.41,
        shiftStart: '08:00',
        shiftEnd: '08:00', // Identical
      };

      const result = technicianCreateSchema.safeParse(zeroLengthShiftTech);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some((e) => e.path.includes('shiftEnd'))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------
  // 4. Unknown Enums and Type Mismatches
  // -------------------------------------------------------------
  describe('Type Enforcement and Enum Boundaries', () => {
    it('rejects invalid job priority enum value', () => {
      const invalidPriorityJob = {
        customerName: 'Invalid Priority',
        description: 'Test unknown priority',
        requiredSkills: ['HVAC'],
        priority: 'ULTRA_CRITICAL_EMERGENCY', // Unknown enum
        estimatedDuration: 60,
        latitude: 37.7749,
        longitude: -122.4194,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: '2026-11-02T08:00:00.000Z',
        latestEnd: '2026-11-02T17:00:00.000Z',
        slaDeadline: '2026-11-02T16:00:00.000Z',
      };

      const result = jobCreateSchema.safeParse(invalidPriorityJob);
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric duration', () => {
      const invalidDurationJob = {
        customerName: 'String Duration',
        description: 'Duration given as text',
        requiredSkills: ['HVAC'],
        priority: 'MEDIUM',
        estimatedDuration: 'sixty_minutes', // Type mismatch
        latitude: 37.7749,
        longitude: -122.4194,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: '2026-11-02T08:00:00.000Z',
        latestEnd: '2026-11-02T17:00:00.000Z',
        slaDeadline: '2026-11-02T16:00:00.000Z',
      };

      const result = jobCreateSchema.safeParse(invalidDurationJob);
      expect(result.success).toBe(false);
    });

    it('rejects zero or negative duration', () => {
      const negativeDurationJob = {
        customerName: 'Negative Duration',
        description: 'Duration <= 0',
        requiredSkills: ['HVAC'],
        priority: 'MEDIUM',
        estimatedDuration: -30,
        latitude: 37.7749,
        longitude: -122.4194,
        serviceZone: 'ZONE_CENTRAL',
        earliestStart: '2026-11-02T08:00:00.000Z',
        latestEnd: '2026-11-02T17:00:00.000Z',
        slaDeadline: '2026-11-02T16:00:00.000Z',
      };

      const result = jobCreateSchema.safeParse(negativeDurationJob);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 5. Job State Machine Transition Rules
  // -------------------------------------------------------------
  describe('Job State Machine Integrity', () => {
    it('allows valid transitions according to state machine', () => {
      // PENDING -> ASSIGNED
      expect(() => validateJobStatusTransition('PENDING', 'ASSIGNED')).not.toThrow();

      // ASSIGNED -> IN_PROGRESS
      expect(() => validateJobStatusTransition('ASSIGNED', 'IN_PROGRESS')).not.toThrow();

      // IN_PROGRESS -> COMPLETED
      expect(() => validateJobStatusTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow();

      // ASSIGNED -> UNASSIGNED
      expect(() => validateJobStatusTransition('ASSIGNED', 'UNASSIGNED')).not.toThrow();

      // UNASSIGNED -> PENDING
      expect(() => validateJobStatusTransition('UNASSIGNED', 'PENDING')).not.toThrow();
    });

    it('strictly forbids transitions out of terminal states (COMPLETED, CANCELLED)', () => {
      // COMPLETED is terminal
      expect(() => validateJobStatusTransition('COMPLETED', 'PENDING')).toThrow(AppError);
      expect(() => validateJobStatusTransition('COMPLETED', 'IN_PROGRESS')).toThrow(AppError);
      expect(() => validateJobStatusTransition('COMPLETED', 'CANCELLED')).toThrow(AppError);

      // CANCELLED is terminal
      expect(() => validateJobStatusTransition('CANCELLED', 'ASSIGNED')).toThrow(AppError);
      expect(() => validateJobStatusTransition('CANCELLED', 'PENDING')).toThrow(AppError);
    });

    it('forbids invalid skips (e.g. PENDING straight to COMPLETED)', () => {
      expect(() => validateJobStatusTransition('PENDING', 'COMPLETED')).toThrow(AppError);
    });

    it('rejects transitioning to the identical state', () => {
      expect(() => validateJobStatusTransition('ASSIGNED', 'ASSIGNED')).toThrow(AppError);
    });
  });

  // -------------------------------------------------------------
  // 6. Query Parameter Sanitization and Boundary Protection
  // -------------------------------------------------------------
  describe('Query Parameter Sanitization', () => {
    it('sanitizes and clamps pagination parameters', () => {
      // Coerces string numbers
      const parsed = jobQuerySchema.safeParse({
        page: '2',
        limit: '50',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(2);
        expect(parsed.data.limit).toBe(50);
      }
    });

    it('rejects negative or zero page numbers', () => {
      const parsed = jobQuerySchema.safeParse({ page: -1 });
      expect(parsed.success).toBe(false);
    });

    it('rejects limits exceeding maximum threshold (500)', () => {
      const parsed = jobQuerySchema.safeParse({ limit: 10000 });
      expect(parsed.success).toBe(false);
    });

    it('safely trims search query strings containing SQL injection characters', () => {
      const injectionAttempt = "'; DROP TABLE jobs; --";
      const parsed = jobQuerySchema.safeParse({
        search: injectionAttempt,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.search).toBe(injectionAttempt);
      }
    });
  });
});
