import { Coordinates } from '../scheduling/scheduling.types';

export type DisruptionEventType =
  | 'TECHNICIAN_UNAVAILABLE'
  | 'URGENT_JOB_ARRIVAL'
  | 'JOB_DURATION_CHANGED'
  | 'JOB_CANCELLED'
  | 'EARLY_COMPLETION'
  | 'DELAYED_COMPLETION';

export type DisruptionRecoveryStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'PARTIALLY_RESOLVED'
  | 'FAILED'
  | 'DISMISSED';

export type RecoveryActionType =
  | 'REASSIGN'
  | 'SLIDE_WINDOW'
  | 'CANCEL'
  | 'MARK_UNASSIGNED'
  | 'DISPATCH_NEW'
  | 'MAINTAIN';

export type RecoveryFailureCode =
  | 'NO_ALTERNATIVE_TECHNICIAN'
  | 'REQUIRED_SKILL_UNAVAILABLE'
  | 'NO_FEASIBLE_TIME_SLOT'
  | 'SLA_CANNOT_BE_PRESERVED'
  | 'TRAVEL_TIME_CONFLICT'
  | 'ALL_ELIGIBLE_TECHNICIANS_BUSY';

export interface AffectedJobInfo {
  jobId: string;
  customerName: string;
  priority: string;
  serviceZone: string;
  requiredSkills: string[];
  estimatedDuration: number;
  currentTechnicianId: string | null;
  currentTechnicianName: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  slaDeadline: Date;
  status: string;
  isProtected: boolean; // COMPLETED or IN_PROGRESS
  cause: string;
}

export interface RecoveryAction {
  jobId: string;
  customerName: string;
  priority: string;
  actionType: RecoveryActionType;
  previousTechnicianId: string | null;
  previousTechnicianName: string | null;
  newTechnicianId: string | null;
  newTechnicianName: string | null;
  previousStart: Date | null;
  previousEnd: Date | null;
  newStart: Date | null;
  newEnd: Date | null;
  travelTimeMinutes: number;
  explanation: string;
  slaPreserved: boolean;
  slaBufferMinutes: number;
  failureCode?: RecoveryFailureCode;
  suggestedAction?: string;
}

export interface RecoveryMetrics {
  affectedJobsCount: number;
  recoveredJobsCount: number;
  unrecoveredJobsCount: number;
  changedAssignmentsCount: number;
  unchangedAssignmentsCount: number;
  slaViolationsBefore: number;
  slaViolationsAfter: number;
  travelMinutesBefore: number;
  travelMinutesAfter: number;
  technicianUtilizationBefore: number;
  technicianUtilizationAfter: number;
  overtimeMinutesBefore: number;
  overtimeMinutesAfter: number;
  recoverySuccessRate: number; // 0 - 100%
  durationMs: number;
}

export interface RecoveryEngineOptions {
  referenceDate?: Date;
  runId?: string;
}

export interface RecoveryEngineResult {
  runId: string;
  disruptionId: string;
  eventType: DisruptionEventType;
  recoveryStatus: DisruptionRecoveryStatus;
  metrics: RecoveryMetrics;
  actions: RecoveryAction[];
  affectedJobs: AffectedJobInfo[];
  updatedAssignments: Array<{
    jobId: string;
    technicianId: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    travelTime: number;
    status: string;
  }>;
  cancelledJobIds: string[];
  unassignedJobIds: string[];
  timestamp: string;
}
