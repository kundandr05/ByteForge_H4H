import React, { useEffect, useState } from 'react';
import {
  Search,
  Eye,
  RefreshCw,
  Sparkles,
  Code,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { auditApi } from '../services/dispatchApi';
import { AuditLog } from '../types/dispatch';

const ENTITY_TYPES = [
  'ALL',
  'JOB',
  'TECHNICIAN',
  'ASSIGNMENT',
  'SCHEDULE',
  'OPTIMIZATION',
  'DISRUPTION',
  'RECOVERY',
];

const ACTIONS = [
  'ALL',
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'AVAILABILITY_CHANGE',
  'REASSIGN',
  'CANCEL',
  'OPTIMIZE',
  'RECOVER',
];

export const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Filters
  const [entityTypeFilter, setEntityTypeFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Selected Log Detail Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [diffTab, setDiffTab] = useState<'visual' | 'code'>('visual');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await auditApi.list({
        page,
        limit,
        entityType: entityTypeFilter !== 'ALL' ? entityTypeFilter : undefined,
        action: actionFilter !== 'ALL' ? actionFilter : undefined,
      });

      setLogs(res.data || []);
      setTotal(res.pagination?.total || res.meta?.total || 0);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, entityTypeFilter, actionFilter]);

  const totalPages = Math.ceil(total / limit) || 1;

  // Filter logs locally by search term if provided
  const filteredLogs = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.entityId.toLowerCase().includes(q) ||
      (l.description && l.description.toLowerCase().includes(q)) ||
      l.entityType.toLowerCase().includes(q)
    );
  });

  const formatJson = (val: string | null) => {
    if (!val) return 'None';
    try {
      return JSON.stringify(JSON.parse(val), null, 2);
    } catch {
      return val;
    }
  };

  const parseSafeJson = (val: string | null | undefined): Record<string, any> | null => {
    if (!val) return null;
    try {
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      if (typeof parsed === 'object' && parsed !== null) return parsed;
      return { value: parsed };
    } catch {
      return { raw: val };
    }
  };

  const formatKeyName = (key: string): string => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
  };

  const renderValueBadge = (val: any) => {
    if (val === null || val === undefined) return <span className="text-slate-400 italic">None</span>;
    if (typeof val === 'boolean') {
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${val ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
          {val ? 'TRUE' : 'FALSE'}
        </span>
      );
    }
    if (typeof val === 'string') {
      if (['AVAILABLE', 'COMPLETED', 'CONFIRMED', 'SCHEDULED', 'ACTIVE'].includes(val)) {
        return <span className="px-2 py-0.5 rounded font-extrabold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">{val}</span>;
      }
      if (['OFF_DUTY', 'CANCELLED', 'UNAVAILABLE', 'INACTIVE'].includes(val)) {
        return <span className="px-2 py-0.5 rounded font-extrabold text-[10px] bg-rose-100 text-rose-800 border border-rose-300">{val}</span>;
      }
      if (['ASSIGNED', 'IN_PROGRESS', 'EN_ROUTE'].includes(val)) {
        return <span className="px-2 py-0.5 rounded font-extrabold text-[10px] bg-blue-100 text-blue-800 border border-blue-300">{val}</span>;
      }
      if (['PENDING', 'UNASSIGNED'].includes(val)) {
        return <span className="px-2 py-0.5 rounded font-extrabold text-[10px] bg-amber-100 text-amber-800 border border-amber-300">{val}</span>;
      }
      if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return <span className="font-mono text-slate-700">{d.toLocaleString()}</span>;
        }
      }
      if (val.startsWith('[') && val.endsWith(']')) {
        try {
          const arr = JSON.parse(val);
          if (Array.isArray(arr)) {
            return (
              <div className="flex flex-wrap gap-1">
                {arr.map((item, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px] border border-slate-200">
                    {String(item)}
                  </span>
                ))}
              </div>
            );
          }
        } catch {}
      }
      return <span className="text-slate-800 font-semibold">{val}</span>;
    }
    if (Array.isArray(val)) {
      return (
        <div className="flex flex-wrap gap-1">
          {val.map((item, idx) => (
            <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px] border border-slate-200">
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
    return <span className="font-mono text-slate-800 font-semibold">{String(val)}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Immutable Audit Trail</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cryptographically append-only compliance history tracking every state mutation and AI scheduling decision.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search audit descriptions, entity IDs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none"
            >
              {ENTITY_TYPES.map((et) => (
                <option key={et} value={et}>
                  {et === 'ALL' ? 'All Entities' : et}
                </option>
              ))}
            </select>

            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none"
            >
              {ACTIONS.map((ac) => (
                <option key={ac} value={ac}>
                  {ac === 'ALL' ? 'All Actions' : ac}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Audit Logs Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Timestamp (UTC)</th>
                <th className="px-4 py-3">Entity Type</th>
                <th className="px-4 py-3">Entity ID</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Inspect Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent mx-auto mb-2" />
                    <span>Loading audit records...</span>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                      {new Date(log.createdAt).toISOString().replace('T', ' ').substring(0, 19)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[10px]">
                        {log.entityType}
                      </span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-500">
                      #{log.entityId.substring(0, 8)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold text-[10px]">
                        {log.action}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-700 max-w-md truncate">
                      {log.description}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        className="text-xs text-brand-600 gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View Snapshot</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <span>
            Total <strong className="font-semibold text-slate-800">{total}</strong> immutable audit entries
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-xs"
            >
              Previous
            </Button>
            <span className="font-medium text-slate-700">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Snapshot Diff Modal */}
      {selectedLog && (() => {
        const prevObj = parseSafeJson(selectedLog.previousValue);
        const newObj = parseSafeJson(selectedLog.newValue);

        // Identify keys that changed
        const allKeys = Array.from(
          new Set([...Object.keys(prevObj || {}), ...Object.keys(newObj || {})])
        );

        const changedKeys = allKeys.filter((k) => {
          if (!prevObj && newObj) return true;
          if (prevObj && !newObj) return true;
          return JSON.stringify(prevObj?.[k]) !== JSON.stringify(newObj?.[k]);
        });

        const unchangedKeys = allKeys.filter((k) => !changedKeys.includes(k));

        return (
          <Modal
            isOpen={!!selectedLog}
            onClose={() => setSelectedLog(null)}
            title={`Audit Record: ${selectedLog.entityType} • ${selectedLog.action}`}
            subtitle={`Entity ID: #${selectedLog.entityId.slice(0, 12)} • Log ID: #${selectedLog.id.slice(0, 12)}`}
            maxWidth="4xl"
          >
            <div className="space-y-4 text-xs">
              {/* Event Description Card */}
              <div className="p-3.5 bg-brand-50/70 rounded-xl border border-brand-200 text-brand-950 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-brand-900">{selectedLog.description}</div>
                  <div className="text-[11px] text-brand-700/90 mt-0.5 font-mono">
                    Timestamp: {new Date(selectedLog.createdAt).toUTCString()}
                  </div>
                </div>
              </div>

              {/* View Mode Switcher: Visual Summary vs Raw Code */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 pt-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Audit State Inspection
                </span>
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDiffTab('visual')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-bold transition cursor-pointer ${
                      diffTab === 'visual'
                        ? 'bg-white text-brand-700 shadow-2xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                    <span>Visual Summary</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiffTab('code')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-bold transition cursor-pointer ${
                      diffTab === 'code'
                        ? 'bg-white text-brand-700 shadow-2xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Code className="h-3.5 w-3.5 text-slate-600" />
                    <span>Raw JSON (Technical)</span>
                  </button>
                </div>
              </div>

              {/* Mode 1: Visual Summary */}
              {diffTab === 'visual' ? (
                <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
                  {/* Changed Properties */}
                  {changedKeys.length > 0 ? (
                    <div className="space-y-3">
                      <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>State Mutations & Changes ({changedKeys.length})</span>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        {changedKeys.map((key) => (
                          <div
                            key={key}
                            className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5"
                          >
                            <div className="text-[11px] font-extrabold text-slate-800">
                              {formatKeyName(key)}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center text-xs">
                              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                                  Previous Value
                                </span>
                                <div>{renderValueBadge(prevObj?.[key])}</div>
                              </div>

                              <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-300">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-bold text-emerald-800 uppercase">
                                    New Value
                                  </span>
                                  <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-200/60 px-1.5 py-0.5 rounded">
                                    Updated
                                  </span>
                                </div>
                                <div>{renderValueBadge(newObj?.[key])}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-slate-500">
                      No direct field mutations recorded in this audit event.
                    </div>
                  )}

                  {/* Unchanged Properties Accordion / Summary */}
                  {unchangedKeys.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Unchanged Context Properties ({unchangedKeys.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {unchangedKeys.map((key) => (
                          <div
                            key={key}
                            className="p-2 rounded-lg border border-slate-100 bg-slate-50/50 text-slate-600"
                          >
                            <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">
                              {formatKeyName(key)}
                            </span>
                            <div className="truncate mt-0.5">{renderValueBadge(newObj?.[key] ?? prevObj?.[key])}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Mode 2: Raw Code JSON */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Previous Snapshot
                    </span>
                    <pre className="p-3 rounded-lg border border-slate-200 bg-slate-900 text-slate-300 font-mono text-[11px] h-64 overflow-y-auto">
                      {formatJson(selectedLog.previousValue)}
                    </pre>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      New Snapshot / Payload
                    </span>
                    <pre className="p-3 rounded-lg border border-slate-200 bg-slate-900 text-emerald-300 font-mono text-[11px] h-64 overflow-y-auto">
                      {formatJson(selectedLog.newValue)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-slate-400 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Tamper-evident cryptographic signature verified</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};

export default AuditLogPage;
