import React, { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Edit2,
  XCircle,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { PriorityBadge } from '../components/common/PriorityBadge';
import { ExplainabilityModal } from '../components/explainability/ExplainabilityModal';
import { jobsApi, autoDispatchApi } from '../services/dispatchApi';
import { Job, JobPriority, JobStatus } from '../types/dispatch';

const ALL_SKILLS = [
  'ELECTRICAL',
  'PLUMBING',
  'HVAC',
  'NETWORKING',
  'HARDWARE_REPAIR',
  'SOFTWARE_SUPPORT',
  'MECHANICAL',
  'SECURITY_SYSTEMS',
  'FIBER_OPTICS',
  'GENERAL_MAINTENANCE',
];

const SERVICE_ZONES = [
  'ZONE_CENTRAL',
  'ZONE_NORTH',
  'ZONE_SOUTH',
  'ZONE_EAST',
  'ZONE_WEST',
];

export const JobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals state
  const [explainJobId, setExplainJobId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);
  const [autoDispatching, setAutoDispatching] = useState(false);

  const handleStartAutoDispatch = async () => {
    setAutoDispatching(true);
    setDispatchMessage(null);
    setPageError(null);
    try {
      const res = await autoDispatchApi.autoAllocateAll();
      setDispatchMessage(`Automated allocation initiated for ${res.data.allocated.length} pending jobs. Nearest specialists received live offers!`);
      await fetchJobs();
    } catch (err: any) {
      setPageError(err.message || 'Failed to auto-dispatch pending jobs.');
    } finally {
      setAutoDispatching(false);
    }
  };

  const handleAllocateSingleJob = async (jobId: string) => {
    setDispatchMessage(null);
    setPageError(null);
    try {
      const res = await autoDispatchApi.startAllocation(jobId);
      const offer = res.data.currentOffer;
      setDispatchMessage(`Job #${jobId.slice(0, 8)} dispatched to nearest specialist: ${offer?.technicianName} (${offer?.distanceKm} km away, ~${offer?.travelTimeMinutes}m travel).`);
      await fetchJobs();
    } catch (err: any) {
      setPageError(err.message || 'Failed to auto-dispatch job.');
    }
  };

  // Form state
  const [formData, setFormData] = useState({
    customerName: '',
    description: '',
    requiredSkills: ['ELECTRICAL'] as string[],
    priority: 'MEDIUM' as JobPriority,
    estimatedDuration: 60,
    latitude: 37.7749,
    longitude: -122.4194,
    serviceZone: 'ZONE_CENTRAL',
    earliestStart: '2026-11-02T08:00:00.000Z',
    latestEnd: '2026-11-02T17:00:00.000Z',
    slaDeadline: '2026-11-02T16:00:00.000Z',
  });

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await jobsApi.list({
        page,
        limit,
        search: search || undefined,
        priority: priorityFilter !== 'ALL' ? (priorityFilter as JobPriority) : undefined,
        status: statusFilter !== 'ALL' ? (statusFilter as JobStatus) : undefined,
        serviceZone: zoneFilter !== 'ALL' ? zoneFilter : undefined,
        sortBy,
        sortOrder,
      });

      setJobs(res.data || []);
      setTotal(res.meta?.total || res.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to load jobs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [page, priorityFilter, statusFilter, zoneFilter, sortBy, sortOrder]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchJobs();
  };

  const handleOpenCreateModal = () => {
    setFormData({
      customerName: '',
      description: '',
      requiredSkills: ['HVAC'],
      priority: 'MEDIUM',
      estimatedDuration: 60,
      latitude: 37.7749,
      longitude: -122.4194,
      serviceZone: 'ZONE_CENTRAL',
      earliestStart: new Date('2026-11-02T08:00:00.000Z').toISOString(),
      latestEnd: new Date('2026-11-02T17:00:00.000Z').toISOString(),
      slaDeadline: new Date('2026-11-02T16:00:00.000Z').toISOString(),
    });
    setFormError(null);
    setCreateModalOpen(true);
  };

  const handleOpenEditModal = (job: Job) => {
    setEditJob(job);
    let parsedSkills: string[] = [];
    try {
      parsedSkills = Array.isArray(job.requiredSkills)
        ? job.requiredSkills
        : JSON.parse(job.requiredSkills || '[]');
    } catch {
      parsedSkills = ['ELECTRICAL'];
    }

    setFormData({
      customerName: job.customerName,
      description: job.description,
      requiredSkills: parsedSkills,
      priority: job.priority,
      estimatedDuration: job.estimatedDuration,
      latitude: job.latitude,
      longitude: job.longitude,
      serviceZone: job.serviceZone,
      earliestStart: new Date(job.earliestStart).toISOString(),
      latestEnd: new Date(job.latestEnd).toISOString(),
      slaDeadline: new Date(job.slaDeadline).toISOString(),
    });
    setFormError(null);
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setFormError(null);
    try {
      await jobsApi.create(formData);
      setCreateModalOpen(false);
      fetchJobs();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create job');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editJob) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await jobsApi.update(editJob.id, formData);
      setEditJob(null);
      fetchJobs();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update job');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this work order?')) return;
    try {
      setPageError(null);
      await jobsApi.updateStatus(jobId, 'CANCELLED');
      fetchJobs();
    } catch (err: any) {
      setPageError(err.message || 'Failed to cancel work order');
    }
  };

  const toggleSkill = (skill: string) => {
    setFormData((prev) => {
      const exists = prev.requiredSkills.includes(skill);
      return {
        ...prev,
        requiredSkills: exists
          ? prev.requiredSkills.filter((s) => s !== skill)
          : [...prev.requiredSkills, skill],
      };
    });
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Work Orders & Jobs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage service requests, required labor skills, geo-coordinates, and SLA deadlines.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleStartAutoDispatch}
            isLoading={autoDispatching}
            className="gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-bold"
            title="Automatically dispatch all pending jobs to the nearest qualified online specialists"
          >
            <Zap className="h-4 w-4 text-emerald-600" />
            <span>Auto-Allocate Jobs</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchJobs} className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenCreateModal} className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span>New Work Order</span>
          </Button>
        </div>
      </div>

      {dispatchMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{dispatchMessage}</span>
          </div>
          <button
            onClick={() => setDispatchMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {pageError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{pageError}</span>
          </div>
          <button
            onClick={() => setPageError(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search form */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search customer, description, or job ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </form>

          {/* Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="UNASSIGNED">Unassigned</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={zoneFilter}
              onChange={(e) => {
                setZoneFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none"
            >
              <option value="ALL">All Zones</option>
              {SERVICE_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>

            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split(':');
                setSortBy(sb);
                setSortOrder(so as 'asc' | 'desc');
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none"
            >
              <option value="createdAt:desc">Newest First</option>
              <option value="priority:desc">Priority (High &rarr; Low)</option>
              <option value="slaDeadline:asc">SLA Urgency (Earliest First)</option>
              <option value="customerName:asc">Customer (A &rarr; Z)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Jobs Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Job ID & Customer</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Zone & Location</th>
                <th className="px-4 py-3">Skills Required</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">SLA Deadline</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                      <span>Loading work orders...</span>
                    </div>
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No matching work orders found.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  let skills: string[] = [];
                  try {
                    skills = Array.isArray(job.requiredSkills)
                      ? job.requiredSkills
                      : JSON.parse(job.requiredSkills || '[]');
                  } catch {
                    skills = [];
                  }

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition">
                      {/* Customer & ID */}
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div className="font-semibold text-slate-800">{job.customerName}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          #{job.id.substring(0, 8)} • {job.description.substring(0, 32)}...
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PriorityBadge priority={job.priority} size="sm" />
                      </td>

                      {/* Zone */}
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        <span className="font-medium">{job.serviceZone}</span>
                        <div className="text-[10px] text-slate-400">
                          {job.latitude.toFixed(2)}, {job.longitude.toFixed(2)}
                        </div>
                      </td>

                      {/* Skills */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {skills.map((s, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[9px] font-medium"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        {job.estimatedDuration} mins
                      </td>

                      {/* SLA Deadline */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-slate-800">
                          {new Date(job.slaDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {new Date(job.slaDeadline).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={job.status} size="sm" />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Auto-Dispatch Single Job (Nearest candidate) */}
                          {(job.status === 'PENDING' || job.status === 'UNASSIGNED') && (
                            <button
                              onClick={() => handleAllocateSingleJob(job.id)}
                              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition"
                              title="Start Nearest-Technician Automated Dispatch"
                            >
                              <Zap className="h-4 w-4" />
                            </button>
                          )}

                          {/* Explainability Button */}
                          <button
                            onClick={() => setExplainJobId(job.id)}
                            className="p-1 rounded text-brand-600 hover:bg-brand-50 hover:text-brand-700 transition"
                            title="Why this decision? (Explainability Engine)"
                          >
                            <Sparkles className="h-4 w-4" />
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => handleOpenEditModal(job)}
                            className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
                            title="Edit Job"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          {/* Cancel Button */}
                          {job.status !== 'CANCELLED' && job.status !== 'COMPLETED' && (
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Cancel Job"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <span>
            Showing <strong className="font-semibold text-slate-800">{jobs.length}</strong> of{' '}
            <strong className="font-semibold text-slate-800">{total}</strong> work orders
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

      {/* Explainability Reusable Modal */}
      <ExplainabilityModal
        jobId={explainJobId}
        isOpen={!!explainJobId}
        onClose={() => setExplainJobId(null)}
      />

      {/* Create / Edit Job Modal */}
      <Modal
        isOpen={createModalOpen || !!editJob}
        onClose={() => {
          setCreateModalOpen(false);
          setEditJob(null);
        }}
        title={editJob ? `Edit Work Order #${editJob.id.substring(0, 8)}` : 'Create New Work Order'}
        subtitle="Specify customer demand, SLA boundaries, labor skills, and coordinates"
        maxWidth="2xl"
      >
        <form onSubmit={editJob ? handleUpdateJob : handleCreateJob} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer Name</label>
              <input
                type="text"
                required
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Apex Data Center"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as JobPriority })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              required
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Chiller compressor failure requiring emergency inspection..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Service Zone</label>
              <select
                value={formData.serviceZone}
                onChange={(e) => setFormData({ ...formData, serviceZone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {SERVICE_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Estimated Duration (mins)</label>
              <input
                type="number"
                min={15}
                max={480}
                required
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({ ...formData, estimatedDuration: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">SLA Deadline (UTC)</label>
              <input
                type="text"
                required
                value={formData.slaDeadline}
                onChange={(e) => setFormData({ ...formData, slaDeadline: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono text-[11px]"
                placeholder="2026-11-02T16:00:00.000Z"
              />
            </div>
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Latitude</label>
              <input
                type="number"
                step="any"
                required
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Longitude</label>
              <input
                type="number"
                step="any"
                required
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Required Skills Selection */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Required Labor Skills ({formData.requiredSkills.length} selected)
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-lg border border-slate-200 bg-slate-50">
              {ALL_SKILLS.map((skill) => {
                const selected = formData.requiredSkills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition ${
                      selected
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {skill}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreateModalOpen(false);
                setEditJob(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={actionLoading}>
              {editJob ? 'Save Changes' : 'Create Work Order'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default JobsPage;
