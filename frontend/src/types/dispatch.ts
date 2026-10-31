export type JobPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type JobStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'UNASSIGNED';
export type TechnicianAvailabilityStatus = 'AVAILABLE' | 'ON_SHIFT' | 'UNAVAILABLE' | 'OFF_DUTY';
export type AssignmentStatus = 'SCHEDULED' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type DisruptionEventType =
  | 'TECHNICIAN_UNAVAILABLE'
  | 'URGENT_JOB_ARRIVAL'
  | 'JOB_DURATION_CHANGED'
  | 'JOB_CANCELLED'
  | 'EARLY_COMPLETION'
  | 'DELAYED_COMPLETION';

export type DisruptionRecoveryStatus = 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'FAILED' | 'DISMISSED';

export interface Job {
  id: string;
  customerName: string;
  description: string;
  requiredSkills: string | string[];
  priority: JobPriority;
  estimatedDuration: number;
  latitude: number;
  longitude: number;
  serviceZone: string;
  earliestStart: string;
  latestEnd: string;
  slaDeadline: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  assignments?: Assignment[];
}

export interface Technician {
  id: string;
  name: string;
  email: string;
  phone: string;
  skills: string | string[];
  serviceZones: string | string[];
  latitude: number;
  longitude: number;
  shiftStart: string;
  shiftEnd: string;
  availabilityStatus: TechnicianAvailabilityStatus;
  createdAt: string;
  updatedAt: string;
  assignments?: Assignment[];
  unavailabilities?: TechnicianUnavailability[];
}

export interface Assignment {
  id: string;
  jobId: string;
  technicianId: string;
  scheduledStart: string;
  scheduledEnd: string;
  travelTime: number;
  status: AssignmentStatus;
  createdAt: string;
  updatedAt: string;
  job?: Job;
  technician?: Technician;
}

export interface TechnicianUnavailability {
  id: string;
  technicianId: string;
  startTime: string;
  endTime: string;
  reason: string;
  createdAt: string;
}

export interface SchedulingRun {
  id: string;
  runType: 'INITIAL' | 'OPTIMIZATION' | 'RECOVERY';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  objectiveScore: number | null;
  totalJobs: number;
  assignedJobs: number;
  unassignedJobs: number;
  totalTravelTime: number;
  slaViolations: number;
  technicianUtilization: number | null;
  createdAt: string;
  completedAt: string | null;
  details?: SchedulingRunDetail[];
}

export interface SchedulingRunDetail {
  id: string;
  schedulingRunId: string;
  jobId: string;
  selectedTechnicianId: string | null;
  previousTechnicianId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assignmentStatus: string;
  explanation: string | null;
  rejectionReasons: string | null;
  createdAt: string;
  job?: Job;
  selectedTechnician?: Technician | null;
  previousTechnician?: Technician | null;
}

export interface DisruptionEvent {
  id: string;
  eventType: DisruptionEventType;
  technicianId: string | null;
  jobId: string | null;
  description: string;
  eventPayload: string | null;
  recoveryStatus: DisruptionRecoveryStatus;
  createdAt: string;
  resolvedAt: string | null;
  technician?: Technician | null;
  job?: Job | null;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  description: string | null;
  createdAt: string;
}

export interface ConstraintCheckResult {
  constraint: string;
  passed: boolean;
  details: string;
}

export interface JobExplanation {
  job: {
    id: string;
    customerName: string;
    description: string;
    priority: JobPriority;
    serviceZone: string;
    requiredSkills: string[];
    estimatedDuration: number;
    earliestStart: string;
    latestEnd: string;
    slaDeadline: string;
    status: JobStatus;
    latitude: number;
    longitude: number;
  };
  assignment: {
    id: string;
    technicianId: string;
    technicianName: string;
    scheduledStart: string;
    scheduledEnd: string;
    travelTimeMinutes: number;
    status: string;
  } | null;
  decision: {
    isAssigned: boolean;
    explanation: string;
    selectedTechnician?: {
      id: string;
      name: string;
      email: string;
      phone: string;
      skills: string[];
      serviceZones: string[];
      shiftStart: string;
      shiftEnd: string;
    };
    skillsMatched?: string[];
    serviceZoneMatched?: boolean;
    scores?: {
      assignmentScore: number;
      priorityScore: number;
      slaUrgencyScore: number;
      travelScore: number;
      workloadScore: number;
    };
    constraintsEvaluated?: ConstraintCheckResult[];
    selectionRationale?: string;
    failureDetails?: {
      reasonCode: string;
      classification: 'TEMPORARY' | 'PERMANENT';
      summary: string;
      suggestedAction: string;
      candidatesEvaluated: Array<{
        technicianId: string;
        technicianName: string;
        eligible: boolean;
        rejectionReason: string;
        failedConstraints: string[];
      }>;
    };
  };
  runHistory: Array<{
    runId: string;
    runType: string;
    status: string;
    createdAt: string;
    assignmentStatus: string;
    technicianName: string | null;
    explanation: string | null;
  }>;
}

export interface OptimizationResult {
  runId: string;
  status: string;
  durationMs: number;
  iterationsExecuted: number;
  scoreImprovement: number;
  improvementPercentage: number;
  baselineMetrics: {
    qualityScore: number;
    totalTravelMinutes: number;
    slaViolatedCount: number;
    totalOvertimeMinutes: number;
    workloadStandardDeviation: number;
  };
  optimizedMetrics: {
    qualityScore: number;
    totalTravelMinutes: number;
    slaViolatedCount: number;
    totalOvertimeMinutes: number;
    workloadStandardDeviation: number;
  };
  changes: Array<{
    jobId: string;
    customerName: string;
    priority: string;
    operationType: string;
    previousTechnicianId: string | null;
    previousTechnicianName: string | null;
    newTechnicianId: string;
    newTechnicianName: string;
    previousStart: string | null;
    previousEnd: string | null;
    newStart: string;
    newEnd: string;
    reason: string;
    travelImpactMinutes: number;
    workloadImpactMinutes: number;
    slaImpactMinutes: number;
    scoreDelta: number;
  }>;
  rejectedOperations: Array<{
    jobId: string;
    customerName: string;
    operationType: string;
    candidateTechnicianName?: string;
    rejectionCode: string;
    reason: string;
    scoreDelta?: number;
  }>;
}

export interface RecoveryResult {
  runId: string;
  disruptionId: string;
  eventType: DisruptionEventType;
  recoveryStatus: DisruptionRecoveryStatus;
  metrics: {
    affectedJobsCount: number;
    recoveredJobsCount: number;
    unrecoveredJobsCount: number;
    changedAssignmentsCount: number;
    recoverySuccessRate: number;
    durationMs: number;
    travelMinutesBefore: number;
    travelMinutesAfter: number;
    slaViolationsBefore: number;
    slaViolationsAfter: number;
  };
  actions: Array<{
    jobId: string;
    customerName: string;
    priority: string;
    actionType: string;
    previousTechnicianId: string | null;
    previousTechnicianName: string | null;
    newTechnicianId: string | null;
    newTechnicianName: string | null;
    previousStart: string | null;
    previousEnd: string | null;
    newStart: string | null;
    newEnd: string | null;
    travelTimeMinutes: number;
    explanation: string;
    slaPreserved: boolean;
    slaBufferMinutes: number;
    failureCode?: string;
    suggestedAction?: string;
  }>;
  cancelledJobIds: string[];
  unassignedJobIds: string[];
}
