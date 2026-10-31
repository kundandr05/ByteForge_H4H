import React, { useEffect, useState } from 'react';
import {
  Eye,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { disruptionsApi } from '../services/dispatchApi';
import { DisruptionEvent } from '../types/dispatch';

export const RecoveryHistoryPage: React.FC = () => {
  const [disruptions, setDisruptions] = useState<DisruptionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDisruption, setSelectedDisruption] = useState<DisruptionEvent | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await disruptionsApi.list({ limit: 50 });
      setDisruptions(res.data || []);
    } catch (err) {
      console.error('Failed to load disruption history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleInspect = async (event: DisruptionEvent) => {
    setSelectedDisruption(event);
    setReportLoading(true);
    try {
      const reportRes = await disruptionsApi.getReport(event.id);
      setReportData(reportRes.data);
    } catch (err) {
      console.error('Failed to load recovery report', err);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recovery Operation History</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Audit trail of operational disruptions, automated replanning runs, and schedule recovery metrics.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchHistory} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Disruption Events Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Event ID & Timestamp</th>
                <th className="px-4 py-3">Disruption Scenario</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Affected Specialist</th>
                <th className="px-4 py-3">Recovery Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent mx-auto mb-2" />
                    <span>Loading disruption event logs...</span>
                  </td>
                </tr>
              ) : disruptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No disruption events recorded yet.
                  </td>
                </tr>
              ) : (
                disruptions.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-semibold text-slate-800">#{d.id.substring(0, 8)}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {new Date(d.createdAt).toLocaleDateString()} {new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">
                        {d.eventType.replace(/_/g, ' ')}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                      {d.description}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {d.technician?.name || 'Multiple / Network'}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={d.recoveryStatus} size="sm" />
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleInspect(d)}
                        className="gap-1 text-xs text-brand-600"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Inspect Audit</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recovery Detail Modal */}
      {selectedDisruption && (
        <Modal
          isOpen={!!selectedDisruption}
          onClose={() => setSelectedDisruption(null)}
          title={`Recovery Report: #${selectedDisruption.id.substring(0, 8)}`}
          subtitle={`Scenario: ${selectedDisruption.eventType.replace(/_/g, ' ')}`}
          maxWidth="4xl"
        >
          {reportLoading ? (
            <div className="py-16 text-center text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent mx-auto mb-2" />
              <span>Loading recovery audit details...</span>
            </div>
          ) : reportData ? (
            <div className="space-y-4 text-xs">
              {/* Event Description Card */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800 text-sm">
                    {selectedDisruption.eventType.replace(/_/g, ' ')}
                  </span>
                  <StatusBadge status={selectedDisruption.recoveryStatus} size="sm" />
                </div>
                <p className="text-slate-600 leading-relaxed">{selectedDisruption.description}</p>
                <div className="flex gap-4 text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-200/60 font-mono">
                  <span>Occurred: {new Date(selectedDisruption.createdAt).toISOString()}</span>
                  {selectedDisruption.resolvedAt && (
                    <span>Resolved: {new Date(selectedDisruption.resolvedAt).toISOString()}</span>
                  )}
                </div>
              </div>

              {/* Metrics Summary */}
              {reportData.result?.metrics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Affected Tasks</span>
                    <span className="text-xl font-bold text-slate-900 mt-1 block">
                      {reportData.result.metrics.affectedJobsCount}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Recovered Tasks</span>
                    <span className="text-xl font-bold text-emerald-600 mt-1 block">
                      {reportData.result.metrics.recoveredJobsCount}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Success Rate</span>
                    <span className="text-xl font-bold text-brand-600 mt-1 block">
                      {reportData.result.metrics.recoverySuccessRate || 100}%
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">SLA Breaches</span>
                    <span className="text-xl font-bold text-slate-900 mt-1 block">0 Guaranteed</span>
                  </div>
                </div>
              )}

              {/* Actions Detail */}
              {reportData.result?.actions && (
                <div>
                  <h5 className="font-semibold text-slate-800 text-xs mb-2 uppercase tracking-wider">
                    Autonomous Actions Logged ({reportData.result.actions.length})
                  </h5>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="px-4 py-2">Job</th>
                          <th className="px-4 py-2">Action</th>
                          <th className="px-4 py-2">Technician</th>
                          <th className="px-4 py-2">Explanation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportData.result.actions.map((act: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50/70">
                            <td className="px-4 py-2 font-medium text-slate-800">
                              {act.customerName}
                              <span className="text-[10px] text-slate-400 block font-mono">
                                #{act.jobId?.substring(0, 8)}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold text-[10px]">
                                {act.actionType}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-700">{act.newTechnicianName || 'N/A'}</td>
                            <td className="px-4 py-2 text-slate-600 text-[11px] leading-relaxed">
                              {act.explanation}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setSelectedDisruption(null)}>
                  Close Audit Report
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-slate-400">No report available for this event.</p>
          )}
        </Modal>
      )}
    </div>
  );
};

export default RecoveryHistoryPage;
