import { z } from 'zod';
import { SHIFT_TIME_REGEX } from '../utils/dateTime';
import { AppError } from '../utils/appError';

// -------------------------------------------------------------
// Enums and Consts
// -------------------------------------------------------------

export const JobPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type JobPriority = z.infer<typeof JobPriorityEnum>;

export const JobStatusEnum = z.enum([
  'PENDING',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'UNASSIGNED',
]);
export type JobStatus = z.infer<typeof JobStatusEnum>;

export const TechnicianAvailabilityStatusEnum = z.enum([
  'AVAILABLE',
  'ON_SHIFT',
  'UNAVAILABLE',
  'OFF_DUTY',
]);
export type TechnicianAvailabilityStatus = z.infer<typeof TechnicianAvailabilityStatusEnum>;

export const AssignmentStatusEnum = z.enum([
  'SCHEDULED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);
export type AssignmentStatus = z.infer<typeof AssignmentStatusEnum>;

export const SchedulingRunTypeEnum = z.enum(['INITIAL', 'OPTIMIZATION', 'RECOVERY']);
export type SchedulingRunType = z.infer<typeof SchedulingRunTypeEnum>;

export const SchedulingRunStatusEnum = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']);
export type SchedulingRunStatus = z.infer<typeof SchedulingRunStatusEnum>;

export const DisruptionEventTypeEnum = z.enum([
  'TECHNICIAN_UNAVAILABLE',
  'URGENT_JOB_ARRIVAL',
  'JOB_DURATION_CHANGED',
  'JOB_CANCELLED',
  'EARLY_COMPLETION',
  'DELAYED_COMPLETION',
]);
export type DisruptionEventType = z.infer<typeof DisruptionEventTypeEnum>;

export const DisruptionRecoveryStatusEnum = z.enum([
  'PENDING',
  'PROCESSING',
  'IN_PROGRESS',
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'FAILED',
  'DISMISSED',
]);
export type DisruptionRecoveryStatus = z.infer<typeof DisruptionRecoveryStatusEnum>;

// -------------------------------------------------------------
// Job State Machine Definition
// -------------------------------------------------------------

export const ALLOWED_JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  PENDING: ['ASSIGNED', 'UNASSIGNED', 'CANCELLED'],
  ASSIGNED: ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'PENDING', 'CANCELLED', 'UNASSIGNED'],
  EN_ROUTE: ['ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  ARRIVED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], // Terminal
  CANCELLED: [], // Terminal
  UNASSIGNED: ['ASSIGNED', 'PENDING', 'CANCELLED'],
};

/**
 * Validates whether a state transition from currentStatus to targetStatus is permitted.
 * Throws AppError with INVALID_STATUS_TRANSITION if disallowed.
 */
export function validateJobStatusTransition(
  currentStatus: JobStatus,
  targetStatus: JobStatus
): void {
  if (currentStatus === targetStatus) {
    throw AppError.badRequest(
      `Job is already in '${currentStatus}' status.`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const allowedNext = ALLOWED_JOB_TRANSITIONS[currentStatus];
  if (!allowedNext || !allowedNext.includes(targetStatus)) {
    throw AppError.badRequest(
      `Invalid job status transition: cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions: [${allowedNext.join(', ') || 'None (Terminal state)'}]`,
      'INVALID_STATUS_TRANSITION'
    );
  }
}

// -------------------------------------------------------------
// Primitives
// -------------------------------------------------------------

export const coordinateSchema = {
  latitude: z
    .number({ required_error: 'Latitude is required' })
    .min(-90, 'Latitude must be >= -90')
    .max(90, 'Latitude must be <= 90'),
  longitude: z
    .number({ required_error: 'Longitude is required' })
    .min(-180, 'Longitude must be >= -180')
    .max(180, 'Longitude must be <= 180'),
};

export const shiftTimeSchema = z
  .string({ required_error: 'Shift time is required' })
  .regex(SHIFT_TIME_REGEX, 'Shift time must be in 24-hour "HH:mm" format (e.g. "08:00")');

// -------------------------------------------------------------
// Technician Schemas
// -------------------------------------------------------------

export const technicianBaseSchema = z.object({
  name: z.string().min(1, 'Technician name is required').max(100),
  email: z.string().email('Invalid email address format'),
  phone: z.string().min(5, 'Phone number must be at least 5 characters').max(25),
  skills: z
    .array(z.string().min(1, 'Skill tag cannot be empty'))
    .min(1, 'At least one skill is required'),
  serviceZones: z
    .array(z.string().min(1, 'Service zone cannot be empty'))
    .min(1, 'At least one service zone is required'),
  latitude: coordinateSchema.latitude,
  longitude: coordinateSchema.longitude,
  shiftStart: shiftTimeSchema,
  shiftEnd: shiftTimeSchema,
  availabilityStatus: TechnicianAvailabilityStatusEnum.default('AVAILABLE'),
});

export const technicianCreateSchema = technicianBaseSchema.refine(
  (data) => data.shiftStart !== data.shiftEnd,
  {
    message: 'shiftStart and shiftEnd cannot be identical',
    path: ['shiftEnd'],
  }
);

export const technicianUpdateSchema = technicianBaseSchema.partial();

export const technicianAvailabilityUpdateSchema = z.object({
  availabilityStatus: TechnicianAvailabilityStatusEnum,
});

export const technicianQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(20),
    search: z.string().trim().optional(),
    skill: z.string().trim().optional(),
    serviceZone: z.string().trim().optional(),
    availability: TechnicianAvailabilityStatusEnum.optional(),
    availabilityStatus: TechnicianAvailabilityStatusEnum.optional(),
    sortBy: z.enum(['createdAt', 'name', 'availabilityStatus']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .transform((data) => ({
    ...data,
    availability: data.availability || data.availabilityStatus,
  }));

// -------------------------------------------------------------
// Job Schemas
// -------------------------------------------------------------

export const jobBaseSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required').max(150),
  description: z.string().min(1, 'Description is required').max(1000),
  requiredSkills: z
    .array(z.string().min(1, 'Skill requirement cannot be empty'))
    .min(1, 'At least one required skill is required'),
  priority: JobPriorityEnum.default('MEDIUM'),
  estimatedDuration: z
    .number({ required_error: 'Estimated duration is required' })
    .int('Estimated duration must be an integer')
    .positive('Estimated duration must be positive (> 0 minutes)'),
  latitude: coordinateSchema.latitude,
  longitude: coordinateSchema.longitude,
  serviceZone: z.string().min(1, 'Service zone is required'),
  earliestStart: z.coerce.date({ required_error: 'Earliest start time is required' }),
  latestEnd: z.coerce.date({ required_error: 'Latest completion time (latestEnd) is required' }),
  slaDeadline: z.coerce.date({ required_error: 'SLA deadline is required' }),
  status: JobStatusEnum.default('PENDING'),
});

export const jobCreateSchema = jobBaseSchema
  .refine(
    (data) => data.earliestStart < data.latestEnd,
    {
      message: 'earliestStart must be before latestEnd',
      path: ['latestEnd'],
    }
  )
  .refine(
    (data) => data.slaDeadline >= data.earliestStart,
    {
      message: 'slaDeadline must be on or after earliestStart',
      path: ['slaDeadline'],
    }
  );

export const jobUpdateSchema = jobBaseSchema.partial();

export const jobStatusUpdateSchema = z.object({
  status: JobStatusEnum,
});

export const jobQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().optional(),
  priority: JobPriorityEnum.optional(),
  status: JobStatusEnum.optional(),
  serviceZone: z.string().trim().optional(),
  sortBy: z.enum(['createdAt', 'priority', 'slaDeadline', 'earliestStart']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// -------------------------------------------------------------
// Assignment Schemas
// -------------------------------------------------------------

export const assignmentBaseSchema = z.object({
  jobId: z.string().uuid('Job ID must be a valid UUID'),
  technicianId: z.string().uuid('Technician ID must be a valid UUID'),
  scheduledStart: z.coerce.date({ required_error: 'Scheduled start is required' }),
  scheduledEnd: z.coerce.date({ required_error: 'Scheduled end is required' }),
  travelTime: z
    .number()
    .int()
    .min(0, 'Travel time cannot be negative')
    .default(0),
  status: AssignmentStatusEnum.default('SCHEDULED'),
});

export const assignmentCreateSchema = assignmentBaseSchema.refine(
  (data) => data.scheduledStart < data.scheduledEnd,
  {
    message: 'scheduledStart must be before scheduledEnd',
    path: ['scheduledEnd'],
  }
);

export const assignmentUpdateSchema = assignmentBaseSchema.partial();

// -------------------------------------------------------------
// Scheduling Run Schemas
// -------------------------------------------------------------

export const schedulingRunCreateSchema = z.object({
  runType: SchedulingRunTypeEnum,
  status: SchedulingRunStatusEnum.default('PENDING'),
  objectiveScore: z.number().optional(),
  totalJobs: z.number().int().min(0).default(0),
  assignedJobs: z.number().int().min(0).default(0),
  unassignedJobs: z.number().int().min(0).default(0),
  totalTravelTime: z.number().int().min(0).default(0),
  slaViolations: z.number().int().min(0).default(0),
  technicianUtilization: z.number().min(0).max(100).optional(),
});

export const schedulingRunDetailCreateSchema = z.object({
  schedulingRunId: z.string().uuid('Scheduling run ID must be a valid UUID'),
  jobId: z.string().uuid('Job ID must be a valid UUID'),
  selectedTechnicianId: z.string().uuid().nullable().optional(),
  previousTechnicianId: z.string().uuid().nullable().optional(),
  scheduledStart: z.coerce.date().nullable().optional(),
  scheduledEnd: z.coerce.date().nullable().optional(),
  assignmentStatus: z.enum(['ASSIGNED', 'UNASSIGNED', 'REASSIGNED']),
  explanation: z.string().optional(),
  rejectionReasons: z.unknown().optional(),
});

// -------------------------------------------------------------
// Disruption Event Schemas
// -------------------------------------------------------------

export const disruptionEventCreateSchema = z.object({
  eventType: DisruptionEventTypeEnum,
  technicianId: z.string().uuid().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  description: z.string().min(1, 'Description is required'),
  eventPayload: z.unknown().optional(),
  recoveryStatus: DisruptionRecoveryStatusEnum.default('PENDING'),
});

// -------------------------------------------------------------
// Technician Unavailability Schemas
// -------------------------------------------------------------

export const technicianUnavailabilityBaseSchema = z.object({
  technicianId: z.string().uuid('Technician ID must be a valid UUID'),
  startTime: z.coerce.date({ required_error: 'Start time is required' }),
  endTime: z.coerce.date({ required_error: 'End time is required' }),
  reason: z.string().min(1, 'Reason is required'),
});

export const technicianUnavailabilityCreateSchema = technicianUnavailabilityBaseSchema.refine(
  (data) => data.startTime < data.endTime,
  {
    message: 'startTime must be before endTime',
    path: ['endTime'],
  }
);

export const technicianUnavailabilityUpdateSchema = technicianUnavailabilityBaseSchema.partial();

// -------------------------------------------------------------
// Audit Log Schemas
// -------------------------------------------------------------

export const auditLogCreateSchema = z.object({
  entityType: z.string().min(1, 'Entity type is required'),
  entityId: z.string().min(1, 'Entity ID is required'),
  action: z.string().min(1, 'Action is required'),
  previousValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  description: z.string().optional(),
});

// -------------------------------------------------------------
// Idempotency Record Schemas
// -------------------------------------------------------------

export const idempotencyRecordCreateSchema = z.object({
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  operationType: z.string().min(1, 'Operation type is required'),
  responseStatus: z.number().int().min(100).max(599),
  responseBody: z.unknown(),
});
