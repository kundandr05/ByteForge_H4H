/**
 * Core Types & Interfaces for DispatchGrid Intelligent Scheduling Engine
 */

export type UnassignedClassification =
  | 'FEASIBLE'
  | 'TEMPORARILY_INFEASIBLE'
  | 'UNASSIGNABLE';

export type UnassignedReasonCode =
  | 'NO_TECHNICIAN_WITH_REQUIRED_SKILLS'
  | 'NO_TECHNICIAN_IN_SERVICE_ZONE'
  | 'TECHNICIAN_UNAVAILABLE'
  | 'NO_FEASIBLE_TIME_SLOT'
  | 'SHIFT_BOUNDARY_CONFLICT'
  | 'TRAVEL_TIME_CONFLICT'
  | 'SLA_DEADLINE_CONFLICT'
  | 'TIME_WINDOW_CONFLICT'
  | 'INSUFFICIENT_TECHNICIAN_CAPACITY';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface CandidateSlot {
  scheduledStart: Date;
  scheduledEnd: Date;
  travelTimeMinutes: number;
  travelDistanceKm: number;
  previousLocation: Coordinates;
  nextLocation?: Coordinates;
  idleGapMinutesBefore: number;
}

export interface ScoreBreakdown {
  slaUrgencyScore: number;       // 0 - 1
  travelEfficiencyScore: number; // 0 - 1
  workloadBalanceScore: number;  // 0 - 1
  priorityScore: number;         // 0 - 1
  stabilityScore: number;        // 0 - 1
  totalScore: number;            // 0 - 100
}

export interface ScoringWeights {
  slaUrgency: number;        // Default: 0.30 (30%)
  travelEfficiency: number;  // Default: 0.25 (25%)
  workloadBalance: number;   // Default: 0.20 (20%)
  prioritySuitability: number; // Default: 0.15 (15%)
  scheduleStability: number; // Default: 0.10 (10%)
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  slaUrgency: 0.30,
  travelEfficiency: 0.25,
  workloadBalance: 0.20,
  prioritySuitability: 0.15,
  scheduleStability: 0.10,
};

export interface CandidateEvaluation {
  technicianId: string;
  technicianName: string;
  isEligible: boolean;
  rejectionReason?: string;
  feasibleSlots: CandidateSlot[];
  bestSlot?: CandidateSlot;
  score?: number;
  scoreBreakdown?: ScoreBreakdown;
}

export interface JobSchedulingDecision {
  jobId: string;
  customerName: string;
  priority: string;
  isAssigned: boolean;
  selectedTechnicianId?: string;
  selectedTechnicianName?: string;
  selectedSlot?: CandidateSlot;
  assignmentScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  explanation: string;
  rejectionReasons: Array<{
    technicianId: string;
    technicianName: string;
    reason: string;
  }>;
  classification?: UnassignedClassification;
  unassignedReasonCode?: UnassignedReasonCode;
  suggestedAction?: string;
}

export interface SchedulingEngineMetrics {
  totalJobs: number;
  assignedJobs: number;
  unassignedJobs: number;
  successRate: number; // Percentage 0 - 100
  totalTravelTimeMinutes: number;
  averageTravelTimeMinutes: number;
  slaViolations: number;
  criticalJobsAssigned: number;
  highJobsAssigned: number;
  mediumJobsAssigned: number;
  lowJobsAssigned: number;
  technicianUtilization: number; // Percentage 0 - 100
  activeTechniciansCount: number;
  totalShiftCapacityMinutes: number;
  totalAllocatedMinutes: number;
  executionDurationMs: number;
}

export interface SchedulingEngineResult {
  runId: string;
  runType: 'INITIAL' | 'OPTIMIZATION' | 'RECOVERY';
  objectiveScore: number;
  metrics: SchedulingEngineMetrics;
  decisions: JobSchedulingDecision[];
  timestamp: string;
}

export interface InMemCommitment {
  id: string;
  jobId?: string;
  type: 'ASSIGNMENT' | 'UNAVAILABILITY';
  startTime: Date;
  endTime: Date;
  location?: Coordinates;
  status?: string;
}

export interface InMemTechnicianSchedule {
  technicianId: string;
  name: string;
  homeLocation: Coordinates;
  shiftStartUtc: Date;
  shiftEndUtc: Date;
  totalShiftMinutes: number;
  allocatedMinutes: number;
  travelMinutes: number;
  commitments: InMemCommitment[];
}
