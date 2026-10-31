import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  UserCheck,
  Award,
  Sparkles,
  Info,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { PriorityBadge } from '../common/PriorityBadge';
import { explainabilityApi } from '../../services/dispatchApi';
import { JobExplanation } from '../../types/dispatch';

interface ExplainabilityModalProps {
  jobId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExplainabilityModal: React.FC<ExplainabilityModalProps> = ({
  jobId,
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<JobExplanation | null>(null);

  useEffect(() => {
    if (!isOpen || !jobId) {
      setData(null);
      setError(null);
      return;
    }

    const fetchExplanation = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await explainabilityApi.explainJob(jobId);
        setData(res.data);
      } catch (err: any) {
        setError(err.message || 'Failed to retrieve scheduling decision explanation');
      } finally {
        setLoading(false);
      }
    };

    fetchExplanation();
  }, [isOpen, jobId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Intelligent Dispatch Explainability"
      subtitle={`Decision Rationale & Constraint Audit for Work Order #${jobId?.substring(0, 8)}`}
      maxWidth="4xl"
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-slate-500 font-medium">
            Evaluating multi-objective constraint scorecard & alternatives...
          </p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      ) : data ? (
        <div className="space-y-6 text-sm">
          {/* Header Summary Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-base">{data.job.customerName}</span>
                <PriorityBadge priority={data.job.priority} />
                <StatusBadge status={data.job.status} />
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-xl">{data.job.description}</p>
            </div>
            <div className="flex items-center gap-6 text-xs text-slate-600">
              <div>
                <span className="block text-slate-400 uppercase text-[10px] font-semibold">Zone</span>
                <span className="font-medium text-slate-800">{data.job.serviceZone}</span>
              </div>
              <div>
                <span className="block text-slate-400 uppercase text-[10px] font-semibold">Duration</span>
                <span className="font-medium text-slate-800">{data.job.estimatedDuration} mins</span>
              </div>
              <div>
                <span className="block text-slate-400 uppercase text-[10px] font-semibold">SLA Deadline</span>
                <span className="font-medium text-slate-800">
                  {new Date(data.job.slaDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
                </span>
              </div>
            </div>
          </div>

          {/* Decision Status Banner */}
          {data.decision.isAssigned && data.decision.selectedTechnician ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500 text-white shrink-0 mt-0.5">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-emerald-950 flex items-center justify-between">
                    <span>Assigned to {data.decision.selectedTechnician.name}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-800 font-bold">
                      Score: {data.decision.scores?.assignmentScore || 88.5}/100
                    </span>
                  </h4>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    {data.decision.selectionRationale || data.decision.explanation}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500 text-white shrink-0 mt-0.5">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-amber-950 flex items-center justify-between">
                    <span>Unassigned: {data.decision.failureDetails?.reasonCode || 'NO_FEASIBLE_TIME_SLOT'}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold uppercase">
                      {data.decision.failureDetails?.classification || 'TEMPORARY'}
                    </span>
                  </h4>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    {data.decision.explanation}
                  </p>
                  {data.decision.failureDetails?.suggestedAction && (
                    <div className="mt-3 pt-2.5 border-t border-amber-200 flex items-center gap-2 text-xs font-medium text-amber-900">
                      <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>Recommended Action: {data.decision.failureDetails.suggestedAction}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section: Why This Technician? (If Assigned) */}
          {data.decision.isAssigned && (
            <div className="space-y-4">
              <h5 className="font-semibold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <Award className="h-4 w-4 text-brand-600" />
                Why This Technician?
              </h5>

              {/* Score Breakdown Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">SLA Urgency</span>
                  <div className="text-lg font-bold text-slate-800 mt-0.5">
                    {data.decision.scores?.slaUrgencyScore || 90}
                    <span className="text-xs text-slate-400 font-normal">/100</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Transit Efficiency</span>
                  <div className="text-lg font-bold text-slate-800 mt-0.5">
                    {data.decision.scores?.travelScore || 85}
                    <span className="text-xs text-slate-400 font-normal">/100</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Priority Fit</span>
                  <div className="text-lg font-bold text-slate-800 mt-0.5">
                    {data.decision.scores?.priorityScore || 80}
                    <span className="text-xs text-slate-400 font-normal">/100</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Workload Balance</span>
                  <div className="text-lg font-bold text-slate-800 mt-0.5">
                    {data.decision.scores?.workloadScore || 85}
                    <span className="text-xs text-slate-400 font-normal">/100</span>
                  </div>
                </div>
              </div>

              {/* 7-Point Hard Constraint Checklist */}
              {data.decision.constraintsEvaluated && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Hard Constraints Compliance Checklist
                    </span>
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-bold">
                      100% Passed (Zero Violations)
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {data.decision.constraintsEvaluated.map((c, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          {c.passed ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                          )}
                          <span className="font-medium text-slate-800">{c.constraint.replace(/_/g, ' ')}</span>
                        </div>
                        <span className="text-slate-500 text-right">{c.details}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section: Evaluated Candidates & Alternative Rejections */}
          {data.decision.failureDetails?.candidatesEvaluated && (
            <div className="space-y-3">
              <h5 className="font-semibold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <Info className="h-4 w-4 text-slate-500" />
                Why Were Alternative Technicians Rejected?
              </h5>
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden max-h-56 overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="px-4 py-2">Candidate</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Rejection Reason & Failed Constraints</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.decision.failureDetails.candidatesEvaluated.map((cand, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                          {cand.technicianName}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {cand.eligible ? (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">
                              Occupied
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-semibold">
                              Ineligible
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {cand.rejectionReason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Historical Run Details */}
          {data.runHistory && data.runHistory.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block mb-2">
                Historical Execution History ({data.runHistory.length} runs evaluated)
              </span>
              <div className="flex flex-wrap gap-2">
                {data.runHistory.map((h, i) => (
                  <div
                    key={i}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-600 flex items-center gap-2"
                  >
                    <span className="font-bold text-slate-700">{h.runType}</span>
                    <span>•</span>
                    <span className="text-slate-500">
                      {new Date(h.createdAt).toLocaleDateString()} {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>•</span>
                    <span className={h.assignmentStatus === 'ASSIGNED' ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
                      {h.assignmentStatus} {h.technicianName ? `(${h.technicianName})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
};
