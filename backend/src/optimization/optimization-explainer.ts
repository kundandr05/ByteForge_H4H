import {
  AssignmentChangeRecord,
  OptimizationOperationType,
  OptimizationRejectionCode,
  RejectedOperationRecord,
} from './optimization.types';

export function createAssignmentChangeExplanation(
  job: any,
  prevTech: any | null,
  newTech: any,
  prevStart: Date | null,
  prevEnd: Date | null,
  newStart: Date,
  newEnd: Date,
  operationType: OptimizationOperationType,
  travelImpactMinutes: number,
  workloadImpactMinutes: number,
  slaImpactMinutes: number,
  scoreDelta: number
): AssignmentChangeRecord {
  const newStartStr = newStart.toISOString().substring(11, 16);
  const newEndStr = newEnd.toISOString().substring(11, 16);
  const prevStartStr = prevStart ? prevStart.toISOString().substring(11, 16) : 'N/A';
  const prevEndStr = prevEnd ? prevEnd.toISOString().substring(11, 16) : 'N/A';

  let reasonDesc = '';
  switch (operationType) {
    case 'REORDER_ROUTE':
      reasonDesc = `Reordered route stops for ${newTech.name} to minimize transit distance (travel improved by ${Math.abs(travelImpactMinutes)}m).`;
      break;
    case 'MOVE_TIME_SLOT':
      reasonDesc = `Shifted appointment window from ${prevStartStr}-${prevEndStr} to ${newStartStr}-${newEndStr} UTC to eliminate idle gap and increase SLA safety margin.`;
      break;
    case 'REASSIGN_TECHNICIAN':
      reasonDesc = `Reassigned from ${prevTech?.name || 'Unassigned'} to ${newTech.name} to balance shift workload and optimize zone proximity.`;
      break;
    case 'SWAP_JOBS':
      reasonDesc = `Swapped appointment with ${prevTech?.name} to resolve mutual route detour and improve schedule efficiency.`;
      break;
    case 'ASSIGN_UNASSIGNED':
      reasonDesc = `Dispatched previously unassigned ${job.priority} priority work order into newly optimized schedule gap.`;
      break;
  }

  return {
    jobId: job.id,
    customerName: job.customerName,
    priority: job.priority,
    previousTechnicianId: prevTech ? prevTech.id : null,
    previousTechnicianName: prevTech ? prevTech.name : null,
    newTechnicianId: newTech.id,
    newTechnicianName: newTech.name,
    previousStart: prevStart,
    previousEnd: prevEnd,
    newStart,
    newEnd,
    operationType,
    reason: reasonDesc,
    travelImpactMinutes,
    workloadImpactMinutes,
    slaImpactMinutes,
    scoreDelta: Math.round(scoreDelta * 100) / 100,
  };
}

export function createRejectedOperationExplanation(
  job: any,
  operationType: OptimizationOperationType,
  rejectionCode: OptimizationRejectionCode,
  targetTech?: any,
  details?: string
): RejectedOperationRecord {
  let defaultReason = '';
  switch (rejectionCode) {
    case 'PROTECTED_ASSIGNMENT':
      defaultReason = `Job is currently IN_PROGRESS or COMPLETED and is locked against modifications.`;
      break;
    case 'SKILL_MISMATCH':
      defaultReason = `Target technician ${targetTech?.name || ''} lacks required technical skills.`;
      break;
    case 'SHIFT_CONFLICT':
      defaultReason = `Proposed window extends beyond target technician shift hours.`;
      break;
    case 'TIME_WINDOW_CONFLICT':
      defaultReason = `Proposed appointment violates customer earliestStart or latestEnd window.`;
      break;
    case 'SLA_CONFLICT':
      defaultReason = `Completion time violates customer hard SLA deadline.`;
      break;
    case 'TRAVEL_TIME_CONFLICT':
      defaultReason = `Insufficient travel transit buffer from previous stop or to subsequent appointment.`;
      break;
    case 'OVERLAPPING_ASSIGNMENT':
      defaultReason = `Proposed appointment overlaps with an existing commitment or registered unavailability.`;
      break;
    case 'NO_OBJECTIVE_IMPROVEMENT':
      defaultReason = `Proposed move satisfies hard constraints but does not yield a net improvement in the objective quality score.`;
      break;
  }

  return {
    jobId: job.id,
    customerName: job.customerName,
    operationType,
    targetTechnicianId: targetTech?.id,
    targetTechnicianName: targetTech?.name,
    rejectionCode,
    reason: details || defaultReason,
  };
}
