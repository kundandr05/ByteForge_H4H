import { EvaluatedAssignment } from './optimization.objective';

export interface TechnicianWorkloadItem {
  technicianId: string;
  technicianName: string;
  shiftMinutes: number;
  allocatedWorkMinutes: number;
  travelMinutes: number;
  assignmentCount: number;
  utilizationPercent: number;
}

export interface WorkloadDistributionReport {
  technicians: TechnicianWorkloadItem[];
  meanWorkloadMinutes: number;
  stdDevMinutes: number;
  variance: number;
  minWorkloadMinutes: number;
  maxWorkloadMinutes: number;
  spreadMinutes: number; // max - min
}

/**
 * Calculates detailed workload distribution and imbalance statistics
 * across all active technicians.
 */
export function analyzeWorkloadDistribution(
  assignments: EvaluatedAssignment[],
  technicians: any[]
): WorkloadDistributionReport {
  const activeTechs = technicians.filter(
    (t) => t.availabilityStatus !== 'OFF_DUTY' && t.availabilityStatus !== 'UNAVAILABLE'
  );

  const items: TechnicianWorkloadItem[] = [];

  for (const tech of activeTechs) {
    const techAssignments = assignments.filter((a) => a.technicianId === tech.id);
    const allocatedWorkMinutes = techAssignments.reduce(
      (sum, a) => sum + (a.job?.estimatedDuration || 0),
      0
    );
    const travelMinutes = techAssignments.reduce(
      (sum, a) => sum + a.travelTimeMinutes,
      0
    );

    const [sh, sm] = tech.shiftStart.split(':').map(Number);
    const [eh, em] = tech.shiftEnd.split(':').map(Number);
    let shiftMinutes = (eh * 60 + em) - (sh * 60 + sm);
    if (shiftMinutes <= 0) shiftMinutes += 1440;

    const utilizationPercent = shiftMinutes > 0
      ? Math.round((allocatedWorkMinutes / shiftMinutes) * 10000) / 100
      : 0;

    items.push({
      technicianId: tech.id,
      technicianName: tech.name,
      shiftMinutes,
      allocatedWorkMinutes,
      travelMinutes,
      assignmentCount: techAssignments.length,
      utilizationPercent,
    });
  }

  const workloads = items.map((i) => i.allocatedWorkMinutes);
  const count = Math.max(1, items.length);
  const meanWorkloadMinutes = Math.round((workloads.reduce((a, b) => a + b, 0) / count) * 10) / 10;
  const variance = Math.round(
    workloads.reduce((sum, w) => sum + Math.pow(w - meanWorkloadMinutes, 2), 0) / count
  );
  const stdDevMinutes = Math.round(Math.sqrt(variance) * 10) / 10;
  const minWorkloadMinutes = Math.min(...workloads, 0);
  const maxWorkloadMinutes = Math.max(...workloads, 0);
  const spreadMinutes = Math.max(0, maxWorkloadMinutes - minWorkloadMinutes);

  return {
    technicians: items,
    meanWorkloadMinutes,
    stdDevMinutes,
    variance,
    minWorkloadMinutes,
    maxWorkloadMinutes,
    spreadMinutes,
  };
}
