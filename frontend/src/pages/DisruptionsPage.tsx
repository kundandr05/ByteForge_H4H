import React, { useEffect, useState } from 'react';
import {
  UserX,
  AlertOctagon,
  Clock,
  XCircle,
  FastForward,
  RotateCcw,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { disruptionsApi, techniciansApi, jobsApi, schedulingApi } from '../services/dispatchApi';
import { Technician, Assignment, DisruptionEventType, RecoveryResult } from '../types/dispatch';

export const DisruptionsPage: React.FC = () => {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [scheduledAssignments, setScheduledAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Active scenario modal state
  const [activeScenario, setActiveScenario] = useState<DisruptionEventType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [disrupError, setDisrupError] = useState<string | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<RecoveryResult | null>(null);

  // Form inputs
  const [selectedTechId, setSelectedTechId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [scenarioReason, setScenarioReason] = useState('Vehicle breakdown during transit');
  const [durationDelta, setDurationDelta] = useState(45);
  const [urgentCustomer, setUrgentCustomer] = useState('Emergency Metro Hospital ICU');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [techsRes, schedRes] = await Promise.all([
        techniciansApi.list({ limit: 50 }),
        schedulingApi.getCurrent().catch(() => ({ data: { assignments: [] } })),
      ]);
      setTechnicians(techsRes.data || []);
      const asgns = schedRes.data?.assignments || [];
      setScheduledAssignments(asgns);
      if (techsRes.data?.length > 0) setSelectedTechId(techsRes.data[0].id);
      if (asgns.length > 0) setSelectedJobId(asgns[0].jobId);
    } catch (err) {
      console.error('Failed to load disruption simulator dependencies', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenScenario = (type: DisruptionEventType) => {
    setActiveScenario(type);
    setRecoveryResult(null);
    setDisrupError(null);
  };

  const handleExecuteDisruption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeScenario) return;
    setSubmitting(true);
    setDisrupError(null);
    try {
      let description = '';
      let eventPayload: any = {};
      let jobIdToPass: string | undefined = undefined;
      let techIdToPass: string | undefined = undefined;

      switch (activeScenario) {
        case 'TECHNICIAN_UNAVAILABLE':
          techIdToPass = selectedTechId;
          description = `Technician sudden unavailability: ${scenarioReason}`;
          eventPayload = { reason: scenarioReason };
          break;

        case 'URGENT_JOB_ARRIVAL':
          // Create emergency work order first
          const urgentJob = await jobsApi.create({
            customerName: urgentCustomer,
            description: 'Critical power / chiller breakdown emergency',
            requiredSkills: ['ELECTRICAL', 'HVAC'],
            priority: 'CRITICAL',
            estimatedDuration: 60,
            latitude: 37.7749,
            longitude: -122.4194,
            serviceZone: 'ZONE_CENTRAL',
            earliestStart: '2026-11-02T08:00:00.000Z',
            latestEnd: '2026-11-02T16:00:00.000Z',
            slaDeadline: '2026-11-02T14:00:00.000Z',
            status: 'PENDING',
          });
          jobIdToPass = urgentJob.data.id;
          description = `Urgent break-in work order arrival for ${urgentCustomer}`;
          eventPayload = { priority: 'CRITICAL' };
          break;

        case 'JOB_DURATION_CHANGED':
          jobIdToPass = selectedJobId;
          const asgn = scheduledAssignments.find((a) => a.jobId === selectedJobId);
          techIdToPass = asgn?.technicianId;
          description = `Job duration extended by ${durationDelta} minutes due to unexpected on-site complexity`;
          eventPayload = { newDuration: (asgn?.job?.estimatedDuration || 60) + durationDelta };
          break;

        case 'JOB_CANCELLED':
          jobIdToPass = selectedJobId;
          const asgnCancel = scheduledAssignments.find((a) => a.jobId === selectedJobId);
          techIdToPass = asgnCancel?.technicianId;
          description = 'Customer requested cancellation of scheduled service appointment';
          eventPayload = { cancelReason: 'CUSTOMER_REQUEST' };
          break;

        case 'EARLY_COMPLETION':
          jobIdToPass = selectedJobId;
          const asgnEarly = scheduledAssignments.find((a) => a.jobId === selectedJobId);
          techIdToPass = asgnEarly?.technicianId;
          description = `Technician completed diagnostics ${durationDelta} minutes ahead of schedule`;
          eventPayload = { actualDuration: 30 };
          break;

        case 'DELAYED_COMPLETION':
          jobIdToPass = selectedJobId;
          const asgnLate = scheduledAssignments.find((a) => a.jobId === selectedJobId);
          techIdToPass = asgnLate?.technicianId;
          description = `Technician delayed on site by ${durationDelta} minutes`;
          eventPayload = { delayMinutes: durationDelta };
          break;
      }

      // 1. Register Disruption Event
      const disrupRes = await disruptionsApi.create({
        eventType: activeScenario,
        technicianId: techIdToPass,
        jobId: jobIdToPass,
        description,
        eventPayload,
      });

      // 2. Trigger Autonomous Recovery Engine
      const recovRes = await disruptionsApi.recover(disrupRes.data.id, {
        idempotencyKey: `recov-${Date.now()}`,
      });

      setRecoveryResult(recovRes.data);
      setActiveScenario(null);
      fetchData();
    } catch (err: any) {
      setDisrupError(err.message || 'Recovery execution failed');
    } finally {
      setSubmitting(false);
    }
  };

  const scenarioCards: Array<{
    type: DisruptionEventType;
    title: string;
    description: string;
    icon: any;
    color: string;
  }> = [
    {
      type: 'TECHNICIAN_UNAVAILABLE',
      title: 'Technician Unavailable',
      description: 'Specialist illness, accident, or vehicle breakdown requiring immediate reassignment.',
      icon: UserX,
      color: 'bg-rose-50 border-rose-200 text-rose-700',
    },
    {
      type: 'URGENT_JOB_ARRIVAL',
      title: 'Urgent Break-in Job',
      description: 'High-priority emergency work order arrives needing immediate same-day insertion.',
      icon: AlertOctagon,
      color: 'bg-red-50 border-red-200 text-red-700',
    },
    {
      type: 'JOB_DURATION_CHANGED',
      title: 'Duration Escalation',
      description: 'Unexpected work complexity extends duration, creating downstream route delay.',
      icon: Clock,
      color: 'bg-amber-50 border-amber-200 text-amber-700',
    },
    {
      type: 'JOB_CANCELLED',
      title: 'Job Cancellation',
      description: 'Customer cancels appointment. Slot is released and schedule is compacted.',
      icon: XCircle,
      color: 'bg-slate-50 border-slate-200 text-slate-700',
    },
    {
      type: 'EARLY_COMPLETION',
      title: 'Early Completion',
      description: 'Technician finishes ahead of schedule. Downstream appointments are pulled forward.',
      icon: FastForward,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    },
    {
      type: 'DELAYED_COMPLETION',
      title: 'Delayed Completion',
      description: 'On-site hold-up delays technician. Downstream jobs shifted to safeguard SLAs.',
      icon: RotateCcw,
      color: 'bg-orange-50 border-orange-200 text-orange-700',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 text-brand-600 animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading disruption simulation center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Real-Time Disruption Simulator</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Test autonomous recovery against 6 frontline field disruption scenarios with transactional repair.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {disrupError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{disrupError}</span>
          </div>
          <button
            onClick={() => setDisrupError(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 6 Scenario Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenarioCards.map((sc) => {
          const Icon = sc.icon;
          return (
            <div
              key={sc.type}
              className={`p-5 rounded-xl border ${sc.color} flex flex-col justify-between transition-all hover:shadow-md hover:scale-[1.01]`}
            >
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="p-2 rounded-lg bg-white shadow-xs shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">{sc.title}</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">{sc.description}</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenScenario(sc.type)}
                className="w-full justify-center text-xs"
              >
                Simulate Scenario &rarr;
              </Button>
            </div>
          );
        })}
      </div>

      {/* Recovery Result Live View */}
      {recoveryResult && (
        <Card
          title={`Autonomous Recovery Result: ${recoveryResult.eventType.replace(/_/g, ' ')}`}
          subtitle={`Disruption #${recoveryResult.disruptionId.substring(0, 8)} • Executed in ${recoveryResult.metrics.durationMs}ms`}
        >
          <div className="space-y-4 text-xs">
            {/* Status Banner */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <StatusBadge status={recoveryResult.recoveryStatus} size="md" />
                <span className="font-semibold text-slate-800 text-sm">
                  {recoveryResult.recoveryStatus === 'RESOLVED'
                    ? '100% Operational Recovery Achieved'
                    : 'Partially Recovered with Alternative Action Plan'}
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Affected</span>
                  <span className="font-bold text-slate-900">{recoveryResult.metrics.affectedJobsCount} jobs</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Recovered</span>
                  <span className="font-bold text-emerald-600">{recoveryResult.metrics.recoveredJobsCount} jobs</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Unrecovered</span>
                  <span className="font-bold text-rose-600">{recoveryResult.metrics.unrecoveredJobsCount} jobs</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Success Rate</span>
                  <span className="font-bold text-brand-600">{recoveryResult.metrics.recoverySuccessRate}%</span>
                </div>
              </div>
            </div>

            {/* Actions Table */}
            <div>
              <h5 className="font-semibold text-slate-800 text-xs mb-2 uppercase tracking-wider">
                Autonomous Recovery Actions Taken ({recoveryResult.actions.length})
              </h5>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Customer & Work Order</th>
                      <th className="px-4 py-2.5">Action Type</th>
                      <th className="px-4 py-2.5">Technician Assignment</th>
                      <th className="px-4 py-2.5">SLA Buffer</th>
                      <th className="px-4 py-2.5">Decision Explanation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recoveryResult.actions.map((act, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {act.customerName}
                          <span className="text-[10px] text-slate-400 block font-mono">
                            #{act.jobId.substring(0, 8)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold text-[10px]">
                            {act.actionType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {act.previousTechnicianName !== act.newTechnicianName ? (
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">{act.previousTechnicianName || 'N/A'}</span>
                              <ArrowRight className="h-3 w-3 text-brand-500" />
                              <span className="font-semibold text-slate-800">{act.newTechnicianName}</span>
                            </div>
                          ) : (
                            <span>{act.newTechnicianName || 'N/A'}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {act.slaPreserved ? (
                            <span className="text-emerald-600 font-medium">+{act.slaBufferMinutes}m buffer</span>
                          ) : (
                            <span className="text-rose-600 font-medium">At Risk</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 max-w-sm leading-relaxed">
                          {act.explanation}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Disruption Trigger Modal */}
      <Modal
        isOpen={!!activeScenario}
        onClose={() => setActiveScenario(null)}
        title={`Trigger Scenario: ${activeScenario?.replace(/_/g, ' ')}`}
        subtitle="Configure event payload and submit to real-time recovery engine"
        maxWidth="md"
      >
        <form onSubmit={handleExecuteDisruption} className="space-y-4 text-xs">
          {/* Conditional form fields based on scenario */}
          {activeScenario === 'TECHNICIAN_UNAVAILABLE' && (
            <>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Affected Specialist</label>
                <select
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.availabilityStatus})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unavailability Reason</label>
                <input
                  type="text"
                  required
                  value={scenarioReason}
                  onChange={(e) => setScenarioReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Van broke down on I-80"
                />
              </div>
            </>
          )}

          {activeScenario === 'URGENT_JOB_ARRIVAL' && (
            <>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Emergency Customer</label>
                <input
                  type="text"
                  required
                  value={urgentCustomer}
                  onChange={(e) => setUrgentCustomer(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="St. Mary's General Hospital ICU"
                />
              </div>
              <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-red-700 text-[11px]">
                High-priority break-in dispatch will attempt to insert into existing technician route gaps or rebalance lower-priority tasks.
              </div>
            </>
          )}

          {(activeScenario === 'JOB_DURATION_CHANGED' ||
            activeScenario === 'JOB_CANCELLED' ||
            activeScenario === 'EARLY_COMPLETION' ||
            activeScenario === 'DELAYED_COMPLETION') && (
            <>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Scheduled Appointment</label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {scheduledAssignments.map((a) => (
                    <option key={a.id} value={a.jobId}>
                      {a.job?.customerName || a.jobId.substring(0, 8)} ({a.technician?.name || 'Tech'}) -{' '}
                      {a.job?.priority}
                    </option>
                  ))}
                </select>
              </div>

              {activeScenario !== 'JOB_CANCELLED' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {activeScenario === 'JOB_DURATION_CHANGED'
                      ? 'Duration Increase (mins)'
                      : activeScenario === 'EARLY_COMPLETION'
                      ? 'Time Saved (mins)'
                      : 'Delay on Site (mins)'}
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={180}
                    step={15}
                    required
                    value={durationDelta}
                    onChange={(e) => setDurationDelta(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setActiveScenario(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={submitting}>
              Run Recovery Engine
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DisruptionsPage;
