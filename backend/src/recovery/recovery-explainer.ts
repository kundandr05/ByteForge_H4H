import { RecoveryAction, RecoveryFailureCode } from './recovery.types';

export function createRecoveryExplanation(
  action: Omit<RecoveryAction, 'explanation'>
): string {
  const newStartStr =
    action.newStart && !isNaN(action.newStart.getTime())
      ? action.newStart.toISOString().substring(11, 16)
      : 'N/A';
  const newEndStr =
    action.newEnd && !isNaN(action.newEnd.getTime())
      ? action.newEnd.toISOString().substring(11, 16)
      : 'N/A';
  const prevStartStr =
    action.previousStart && !isNaN(action.previousStart.getTime())
      ? action.previousStart.toISOString().substring(11, 16)
      : 'N/A';
  const prevEndStr =
    action.previousEnd && !isNaN(action.previousEnd.getTime())
      ? action.previousEnd.toISOString().substring(11, 16)
      : 'N/A';

  switch (action.actionType) {
    case 'REASSIGN':
      return (
        `Reassigned from ${action.previousTechnicianName} to ${action.newTechnicianName} ` +
        `for window ${newStartStr}-${newEndStr} UTC. SLA preserved: ${action.slaPreserved ? 'YES' : 'NO'} ` +
        `(${action.slaBufferMinutes}m safety buffer). Travel transit: ${action.travelTimeMinutes}m.`
      );
    case 'SLIDE_WINDOW':
      return (
        `Maintained with ${action.newTechnicianName}, adjusted appointment window from ` +
        `${prevStartStr}-${prevEndStr} to ${newStartStr}-${newEndStr} UTC to accommodate schedule shift. ` +
        `SLA preserved: ${action.slaPreserved ? 'YES' : 'NO'}.`
      );
    case 'DISPATCH_NEW':
      return (
        `Successfully dispatched urgent ${action.priority} job to ${action.newTechnicianName} ` +
        `for window ${newStartStr}-${newEndStr} UTC. SLA deadline preserved with ${action.slaBufferMinutes}m buffer.`
      );
    case 'CANCEL':
      return `Appointment cancelled and removed from active schedule. Prior technician route released.`;
    case 'MARK_UNASSIGNED':
      return (
        `Could not recover job: ${action.failureCode || 'INFEASIBLE'}. ` +
        `Customer window or SLA cannot be met by available backup workforce. Recommended action: ${action.suggestedAction || 'Defer to next shift'}.`
      );
    case 'MAINTAIN':
      return `Protected assignment retained without modifications (${prevStartStr}-${prevEndStr} UTC).`;
  }
}

export function getFailureSuggestedAction(code: RecoveryFailureCode): string {
  switch (code) {
    case 'NO_ALTERNATIVE_TECHNICIAN':
      return 'Cross-zone dispatch override or activate on-call contractor.';
    case 'REQUIRED_SKILL_UNAVAILABLE':
      return 'Expedite specialist contractor or reschedule with customer.';
    case 'NO_FEASIBLE_TIME_SLOT':
      return 'Authorize overtime extension for on-duty technicians or rebook for next available day.';
    case 'SLA_CANNOT_BE_PRESERVED':
      return 'Proactively notify customer of SLA breach and negotiate revised appointment window.';
    case 'TRAVEL_TIME_CONFLICT':
      return 'Rezone route cluster or dispatch closer roving technician.';
    case 'ALL_ELIGIBLE_TECHNICIANS_BUSY':
      return 'Authorize shift overtime or defer lower-priority non-critical jobs.';
  }
}
