import React, { useEffect, useState, useRef } from 'react';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Sliders,
  AlertTriangle,
  Zap,
  Radio,
  Edit3,
  Trash2,
  XCircle,
  Clock,
  MapPin,
  Download,
  Printer,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { PriorityBadge } from '../components/common/PriorityBadge';
import { ExplainabilityModal } from '../components/explainability/ExplainabilityModal';
import { schedulingApi, techniciansApi, jobsApi, autoDispatchApi } from '../services/dispatchApi';
import { Technician, Job, Assignment, JobPriority } from '../types/dispatch';
import { formatServiceZoneAddress, ZONE_ADDRESS_MAP } from '../utils/zoneAddress';
import { useAuth } from '../context/AuthContext';
import { useDispatchStream } from '../hooks/useDispatchStream';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { offlineDb } from '../utils/offlineDb';
import { RealtimeStatusBadge } from '../components/common/RealtimeStatusBadge';
import { WifiOff, Database } from 'lucide-react';

const TIMELINE_START_HOUR = 8; // 08:00 UTC
const TIMELINE_END_HOUR = 18; // 18:00 UTC
const TOTAL_TIMELINE_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;

export const SchedulingBoardPage: React.FC = () => {
  const { user } = useAuth();
  const { isOnline, syncState, pendingCount, lastSyncedAt, syncNow } = useOfflineSync();
  const [isCachedData, setIsCachedData] = useState(false);
  const [cachedSyncTime, setCachedSyncTime] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [schedError, setSchedError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Real-time live clock state
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());

  // Edit Job State
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [editFormData, setEditFormData] = useState({
    customerName: '',
    description: '',
    priority: 'MEDIUM' as JobPriority,
    serviceZone: 'ZONE_NORTH',
    estimatedDuration: 60,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Subscribe to real-time events via SSE hook - replaces polling!
  const { status: streamStatus } = useDispatchStream({
    enabled: isOnline,
    onEvent: (_event) => {
      // Instant operational reactivity on SSE event
      fetchData(false);
    },
  });

  const handleOpenEdit = (job: Job) => {
    setEditingJob(job);
    setEditFormData({
      customerName: job.customerName,
      description: job.description,
      priority: job.priority,
      serviceZone: job.serviceZone || 'ZONE_NORTH',
      estimatedDuration: job.estimatedDuration || 60,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob) return;
    const currentId = editingJob.id;
    setSavingEdit(true);
    setSchedError(null);
    try {
      // Optimistic update
      setUnassignedJobs((prev) =>
        prev.map((j) => (j.id === currentId ? { ...j, ...editFormData } : j))
      );
      await jobsApi.update(currentId, editFormData);
      setAutoScheduleSuccess(`Job #${currentId.slice(0, 8)} updated successfully!`);
      setEditingJob(null);
      await fetchData();
    } catch (err: any) {
      setSchedError(err.message || 'Failed to update job');
      await fetchData();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteJob = async (id: string) => {
    
    try {
      // Optimistic removal
      setUnassignedJobs((prev) => prev.filter((j) => j.id !== id));
      setAssignments((prev) => prev.filter((a) => a.jobId !== id));
      await jobsApi.delete(id);
      setAutoScheduleSuccess('Job deleted successfully.');
      await fetchData();
    } catch (err: any) {
      setSchedError(err.message || 'Failed to delete job.');
      await fetchData();
    }
  };

  const handleCancelAssignment = async (id: string) => {
    
    try {
      // Optimistic status update
      setUnassignedJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status: 'CANCELLED' as any } : j))
      );
      setAssignments((prev) => prev.filter((a) => a.jobId !== id));
      await jobsApi.updateStatus(id, 'CANCELLED');
      setAutoScheduleSuccess('Work order marked as CANCELLED.');
      await fetchData();
    } catch (err: any) {
      setSchedError(err.message || 'Failed to cancel work order.');
      await fetchData();
    }
  };

  // Automated Allocation & Cascading Dispatch states
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [autoScheduleSuccess, setAutoScheduleSuccess] = useState<string | null>(null);
  const [activeCascades, setActiveCascades] = useState<Record<string, any>>({});
  const [dispatchingJobs, setDispatchingJobs] = useState<Record<string, boolean>>({});

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [unassignedJobs, setUnassignedJobs] = useState<Job[]>([]);
  const [currentDate, setCurrentDate] = useState('2026-11-02');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  // Generator options
  const [weights, setWeights] = useState({
    slaUrgency: 30,
    travelEfficiency: 25,
    workloadBalance: 20,
    prioritySuitability: 15,
    scheduleStability: 10,
  });

  const isAutoSchedulingRef = useRef(false);

  // Autonomous Scheduling Engine: Automatically allocates without requiring button clicks
  const triggerAutonomousScheduling = async (unassignedCount: number) => {
    if (unassignedCount === 0 || isAutoSchedulingRef.current) return;
    try {
      isAutoSchedulingRef.current = true;
      setAutoScheduling(true);
      const res = await autoDispatchApi.autoScheduleAll(currentDate);
      setAutoScheduleSuccess(
        res.data.message || `Autonomous Dispatch Engine: Auto-scheduled ${res.data.scheduledCount} jobs to nearest technicians.`
      );
      // Re-fetch assignments and cleared unassigned queue
      const [currentSchedRes, unassignedJobsRes, pendingJobsRes] = await Promise.all([
        schedulingApi.getCurrent().catch(() => ({ data: { assignments: [] } })),
        jobsApi.list({ status: 'UNASSIGNED', limit: 50 }).catch(() => ({ data: [] })),
        jobsApi.list({ status: 'PENDING', limit: 50 }).catch(() => ({ data: [] })),
      ]);
      setAssignments(currentSchedRes.data?.assignments || []);
      const remaining = [...(unassignedJobsRes.data || []), ...(pendingJobsRes.data || [])];
      setUnassignedJobs(Array.from(new Map(remaining.map((j) => [j.id, j])).values()));
    } catch (err: any) {
      console.warn('Autonomous scheduling notice:', err);
    } finally {
      setAutoScheduling(false);
      isAutoSchedulingRef.current = false;
    }
  };

  const fetchData = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      if (!navigator.onLine) {
        // Load from IndexedDB
        const cachedSched = await offlineDb.getCachedSchedule(user.id, currentDate);
        const cachedTechs = await offlineDb.getCachedTechnicians();
        const cachedJobs = await offlineDb.getCachedWorkOrders(user.id);
        if (cachedSched || cachedJobs.length > 0) {
          if (cachedTechs.length > 0) setTechnicians(cachedTechs);
          if (cachedSched) {
            setAssignments(cachedSched.assignments || []);
            setCachedSyncTime(cachedSched.lastSyncedAt);
          }
          if (cachedJobs.length > 0) {
            setUnassignedJobs(cachedJobs.filter((j) => j.status === 'PENDING' || j.status === 'UNASSIGNED') as any);
          }
          setIsCachedData(true);
          return;
        }
      }

      const [techsRes, currentSchedRes, unassignedJobsRes, pendingJobsRes] = await Promise.all([
        techniciansApi.list({ limit: 50 }),
        schedulingApi.getCurrent().catch(() => ({ data: { assignments: [] } })),
        jobsApi.list({ status: 'UNASSIGNED', limit: 50 }).catch(() => ({ data: [] })),
        jobsApi.list({ status: 'PENDING', limit: 50 }).catch(() => ({ data: [] })),
      ]);

      const loadedTechs = techsRes.data || [];
      const loadedAssignments = currentSchedRes.data?.assignments || [];
      setTechnicians(loadedTechs);
      setAssignments(loadedAssignments);

      const allUnassigned = [...(unassignedJobsRes.data || []), ...(pendingJobsRes.data || [])];
      const uniqueUnassigned = Array.from(new Map(allUnassigned.map((j) => [j.id, j])).values());
      setUnassignedJobs(uniqueUnassigned);
      setIsCachedData(false);

      // Cache to IndexedDB for offline PWA persistence
      offlineDb.cacheSchedule(user.id, currentDate, loadedAssignments, uniqueUnassigned.length).catch(() => {});
      offlineDb.cacheTechnicians(loadedTechs).catch(() => {});
      offlineDb.cacheWorkOrders(user.id, [...uniqueUnassigned, ...loadedAssignments.map((a: any) => a.job).filter(Boolean)]).catch(() => {});

      // Autonomous Zero-Click Execution: Automatically dispatch any unassigned work orders immediately
      if (uniqueUnassigned.length > 0) {
        setTimeout(() => {
          triggerAutonomousScheduling(uniqueUnassigned.length);
        }, 150);
      }
    } catch (err) {
      console.warn('Network fetch unavailable, attempting IndexedDB offline cache:', err);
      const cachedSched = await offlineDb.getCachedSchedule(user.id, currentDate);
      const cachedTechs = await offlineDb.getCachedTechnicians();
      const cachedJobs = await offlineDb.getCachedWorkOrders(user.id);
      if (cachedSched || cachedJobs.length > 0) {
        if (cachedTechs.length > 0) setTechnicians(cachedTechs);
        if (cachedSched) {
          setAssignments(cachedSched.assignments || []);
          setCachedSyncTime(cachedSched.lastSyncedAt);
        }
        if (cachedJobs.length > 0) {
          setUnassignedJobs(cachedJobs.filter((j) => j.status === 'PENDING' || j.status === 'UNASSIGNED') as any);
        }
        setIsCachedData(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Replaced 6-second polling with real-time SSE stream events.
    // Slow fallback reconciliation heartbeat (60s) for fail-safe background consistency.
    const slowReconciliation = setInterval(() => {
      if (navigator.onLine) {
        fetchData(false);
      }
    }, 60000);

    return () => clearInterval(slowReconciliation);
  }, [currentDate]);

  const handleGenerateSchedule = async () => {
    setGenerating(true);
    setSchedError(null);
    try {
      const normalizedWeights = {
        slaUrgency: weights.slaUrgency / 100,
        travelEfficiency: weights.travelEfficiency / 100,
        workloadBalance: weights.workloadBalance / 100,
        prioritySuitability: weights.prioritySuitability / 100,
        scheduleStability: weights.scheduleStability / 100,
      };

      const idempotencyKey = `manual-sched-${Date.now()}`;
      await schedulingApi.generate({
        runType: 'INITIAL',
        weights: normalizedWeights,
        idempotencyKey,
        referenceDate: `${currentDate}T00:00:00.000Z`,
      });

      setGenerateModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setSchedError(err.message || 'Scheduling execution failed. Please verify technician and job availability.');
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Automated Allocation: Assigns all pending and unassigned work orders to nearest qualified specialists
   */
  const handleAutoScheduleAll = async () => {
    setAutoScheduling(true);
    setSchedError(null);
    setAutoScheduleSuccess(null);
    try {
      const res = await autoDispatchApi.autoScheduleAll(currentDate);
      setAutoScheduleSuccess(res.data.message || `Successfully auto-scheduled ${res.data.scheduledCount} jobs!`);
      await fetchData();
    } catch (err: any) {
      setSchedError(err.message || 'Failed to execute automated scheduling.');
    } finally {
      setAutoScheduling(false);
    }
  };

  /**
   * Daily Schedule Export to CSV (RFC 4180 format)
   */
  const handleExportCsv = () => {
    if (assignments.length === 0) {
      alert('No scheduled assignments available to export for this shift.');
      return;
    }

    const headers = [
      'Job ID',
      'Customer',
      'Description',
      'Specialist Name',
      'Scheduled Start',
      'Scheduled End',
      'Travel Time (Mins)',
      'Service Zone',
      'Physical Street Address',
      'Status',
      'Priority',
    ];

    const rows = assignments.map((a) => {
      const job = a.job;
      const tech = a.technician || technicians.find((t) => t.id === a.technicianId);
      const zone = job?.serviceZone || 'ZONE_NORTH';
      const address = formatServiceZoneAddress(zone, true).replace(/"/g, '""');
      const start = a.scheduledStart
        ? new Date(a.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      const end = a.scheduledEnd
        ? new Date(a.scheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

      return [
        `"${a.jobId.slice(0, 8)}"`,
        `"${(job?.customerName || 'Valued Client').replace(/"/g, '""')}"`,
        `"${(job?.description || 'Service').replace(/"/g, '""')}"`,
        `"${(tech?.name || 'Assigned Tech').replace(/"/g, '""')}"`,
        `"${start}"`,
        `"${end}"`,
        `"${a.travelTime || 0}"`,
        `"${zone}"`,
        `"${address}"`,
        `"${a.status}"`,
        `"${job?.priority || 'MEDIUM'}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DispatchGrid_Schedule_${currentDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintSchedule = () => {
    window.print();
  };

  /**
   * Dispatches a single job to the nearest specialist (initiates live cascade)
   */
  const handleAutoDispatchSingle = async (jobId: string) => {
    setDispatchingJobs((prev) => ({ ...prev, [jobId]: true }));
    setSchedError(null);
    try {
      const res = await autoDispatchApi.startAllocation(jobId);
      setActiveCascades((prev) => ({ ...prev, [jobId]: res.data }));
      const offer = res.data.currentOffer;
      setAutoScheduleSuccess(`Job #${jobId.slice(0, 8)} dispatched live to nearest specialist: ${offer?.technicianName} (${offer?.distanceKm} km away).`);
    } catch (err: any) {
      setSchedError(err.message || 'Failed to auto-dispatch job.');
    } finally {
      setDispatchingJobs((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  /**
   * Simulates technician response (ACCEPT or REJECT) for demo verification
   */
  const handleSimulate = async (jobId: string, action: 'ACCEPT' | 'REJECT') => {
    try {
      const res = await autoDispatchApi.simulateResponse(jobId, action);
      if (action === 'ACCEPT') {
        setAutoScheduleSuccess(`Specialist accepted! Job #${jobId.slice(0, 8)} is now scheduled and on the timeline.`);
        setActiveCascades((prev) => {
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
        await fetchData();
      } else {
        setAutoScheduleSuccess(res.data.message || 'Offer declined. Cascaded to second closest specialist.');
        if (res.data.cascadeState) {
          setActiveCascades((prev) => ({ ...prev, [jobId]: res.data.cascadeState }));
        }
      }
    } catch (err: any) {
      setSchedError(err.message || 'Simulation action failed.');
    }
  };

  // Group assignments by technician ID
  const assignmentsByTech = new Map<string, Assignment[]>();
  assignments.forEach((asgn) => {
    if (!assignmentsByTech.has(asgn.technicianId)) {
      assignmentsByTech.set(asgn.technicianId, []);
    }
    assignmentsByTech.get(asgn.technicianId)!.push(asgn);
  });

  // Timeline position calculator (percentage 0 to 100%)
  const calculateBlockPosition = (startTimeStr: string, endTimeStr: string) => {
    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);

    const startHour = start.getUTCHours() + start.getUTCMinutes() / 60;
    const endHour = end.getUTCHours() + end.getUTCMinutes() / 60;

    const leftPercent = Math.max(
      0,
      Math.min(100, ((startHour - TIMELINE_START_HOUR) / TOTAL_TIMELINE_HOURS) * 100)
    );
    const widthPercent = Math.max(
      3,
      Math.min(100 - leftPercent, ((endHour - startHour) / TOTAL_TIMELINE_HOURS) * 100)
    );

    return { left: `${leftPercent}%`, width: `${widthPercent}%` };
  };

  const getPriorityColor = (p?: JobPriority) => {
    switch (p) {
      case 'CRITICAL':
        return 'bg-rose-500 border-rose-600 text-white shadow-xs';
      case 'HIGH':
        return 'bg-amber-500 border-amber-600 text-white shadow-xs';
      case 'MEDIUM':
        return 'bg-brand-500 border-brand-600 text-white shadow-xs';
      case 'LOW':
        return 'bg-slate-400 border-slate-500 text-white';
      default:
        return 'bg-brand-500 border-brand-600 text-white';
    }
  };

  // Filter unassigned jobs
  const filteredUnassigned = unassignedJobs.filter(
    (j) => priorityFilter === 'ALL' || j.priority === priorityFilter
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workforce Scheduling Board</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gantt timeline view with transit buffers, shift windows, and AI explainability.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Realtime Stream & Offline Status */}
          <RealtimeStatusBadge
            streamStatus={streamStatus}
            isOnline={isOnline}
            syncState={syncState}
            pendingCount={pendingCount}
            lastSyncedAt={lastSyncedAt}
            onSyncNow={syncNow}
          />

          {/* Real-time Live Operations Clock */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-mono font-bold shadow-2xs">
            <Clock className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
            <span>Live Clock: {currentTime}</span>
          </div>

          {/* Date Picker Switcher */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 text-xs">
            <button
              onClick={() => setCurrentDate('2026-11-02')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                currentDate === '2026-11-02' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Nov 2 (Shift A)
            </button>
            <button
              onClick={() => setCurrentDate('2026-11-03')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                currentDate === '2026-11-03' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Nov 3 (Shift B)
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={() => fetchData()} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading || autoScheduling ? 'animate-spin' : ''}`} />
            <span>Sync Live</span>
          </Button>

          {/* Autonomous Mode Status Indicator & Manual Force Sync */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400 text-emerald-800 font-extrabold text-xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Autonomous Dispatch: ON</span>
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="gap-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer"
            title="Export shift schedule to CSV"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintSchedule}
            className="gap-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer"
            title="Print schedule or save as PDF"
          >
            <Printer className="h-4 w-4 text-blue-600" />
            <span>Print Report</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setGenerateModalOpen(true)}
            className="gap-1.5 text-slate-700 hover:bg-slate-50"
          >
            <Sliders className="h-4 w-4" />
            <span>Manual Weights</span>
          </Button>
        </div>
      </div>

      {/* Offline PWA Cache Notice Banner */}
      {(!isOnline || isCachedData) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
              <WifiOff className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-amber-900 flex items-center gap-2">
                <span>Operating in Offline-First Mode</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-800">
                  IndexedDB Persistent Cache
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Displaying previously synchronized schedule.
                {cachedSyncTime ? ` Last synchronized at ${new Date(cachedSyncTime).toLocaleTimeString()}.` : ''} All pending offline actions will automatically synchronize when connection resumes.
              </p>
            </div>
          </div>
          {pendingCount > 0 && (
            <button
              onClick={syncNow}
              disabled={syncState === 'SYNCING'}
              className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition shadow-xs"
            >
              <Database className="h-3.5 w-3.5" />
              <span>Sync {pendingCount} Pending Changes</span>
            </button>
          )}
        </div>
      )}

      {/* Autonomous Dispatch Active Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-emerald-300 bg-emerald-50/90 text-emerald-950 text-xs shadow-2xs">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
          </span>
          <span className="font-extrabold uppercase tracking-wide text-emerald-900">
            Autonomous Scheduling Engine: Active (Zero Clicks Required)
          </span>
          <span className="text-emerald-700 hidden md:inline">
            • {unassignedJobs.length > 0 ? `${unassignedJobs.length} work order(s) auto-allocating to nearest specialists...` : 'All work orders autonomously routed and placed on timeline'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {unassignedJobs.length > 0 ? (
            <button
              type="button"
              disabled={autoScheduling}
              onClick={handleAutoScheduleAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold transition shadow-2xs text-[11px] disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{autoScheduling ? 'Scheduling...' : 'Force Resync'}</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              100% Scheduled
            </span>
          )}
        </div>
      </div>

      {autoScheduleSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-300 text-emerald-900 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{autoScheduleSuccess}</span>
          </div>
          <button
            onClick={() => setAutoScheduleSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {schedError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{schedError}</span>
          </div>
          <button
            onClick={() => setSchedError(null)}
            className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Board Layout: Timeline on Left, Unassigned Panel on Right */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        {/* Left 3 Cols: Gantt Timeline */}
        <div className="xl:col-span-3 space-y-4">
          <Card padding="none">
            {/* Timeline Header & Scale */}
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
                  Timeline (08:00 - 18:00 UTC)
                </span>
                <span className="text-[11px] text-slate-500">
                  • {assignments.length} assignments scheduled
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Critical
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> High
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-brand-500" /> Medium
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-slate-400" /> Low
                </span>
              </div>
            </div>

            {/* Time Scale Ruler */}
            <div className="flex border-b border-slate-200 bg-slate-100/60 text-[10px] text-slate-500 font-mono font-medium">
              <div className="w-52 shrink-0 border-r border-slate-200 px-3 py-1.5">Specialist</div>
              <div className="flex-1 grid grid-cols-10 text-center divide-x divide-slate-200">
                {Array.from({ length: TOTAL_TIMELINE_HOURS }).map((_, idx) => {
                  const hour = TIMELINE_START_HOUR + idx;
                  return (
                    <div key={hour} className="py-1">
                      {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Technician Rows */}
            <div className="divide-y divide-slate-100 max-h-[650px] overflow-y-auto">
              {loading ? (
                <div className="py-16 text-center text-slate-400">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent mx-auto mb-2" />
                  <span className="text-xs">Building workforce timeline...</span>
                </div>
              ) : technicians.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">No technicians registered.</div>
              ) : (
                technicians.map((tech) => {
                  const techAssignments = assignmentsByTech.get(tech.id) || [];
                  return (
                    <div key={tech.id} className="flex hover:bg-slate-50/50 transition items-center min-h-[58px]">
                      {/* Technician Info Column */}
                      <div className="w-52 shrink-0 border-r border-slate-200 p-2.5 flex items-center justify-between text-xs">
                        <div className="truncate">
                          <span className="font-semibold text-slate-800 truncate block">{tech.name}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {tech.shiftStart} - {tech.shiftEnd} UTC
                          </span>
                        </div>
                        <StatusBadge status={tech.availabilityStatus} size="sm" />
                      </div>

                      {/* Timeline Lane */}
                      <div className="flex-1 relative h-12 bg-white">
                        {/* Hour Guidelines */}
                        <div className="absolute inset-0 grid grid-cols-10 divide-x divide-slate-100 pointer-events-none" />

                        {/* Scheduled Assignment Blocks */}
                        {techAssignments.map((asgn) => {
                          const pos = calculateBlockPosition(asgn.scheduledStart, asgn.scheduledEnd);
                          return (
                            <button
                              key={asgn.id}
                              type="button"
                              onClick={() => setSelectedJobId(asgn.jobId)}
                              style={{ left: pos.left, width: pos.width }}
                              className={`absolute top-1 bottom-1 rounded-md border text-left p-1.5 overflow-hidden transition-transform hover:scale-[1.02] hover:z-20 cursor-pointer ${getPriorityColor(
                                asgn.job?.priority
                              )}`}
                              title={`Customer: ${asgn.job?.customerName || 'Job'} (${asgn.job?.priority || 'MEDIUM'})\nClick to inspect AI explainability & constraints`}
                            >
                              <div className="font-bold text-[10px] truncate leading-tight">
                                {asgn.job?.customerName || `Job #${asgn.jobId.substring(0, 6)}`}
                              </div>
                              <div className="text-[9px] opacity-90 truncate flex items-center justify-between">
                                <span>
                                  {new Date(asgn.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                                  {new Date(asgn.scheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {asgn.travelTime > 0 && (
                                  <span className="opacity-80">+{asgn.travelTime}m</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Right 1 Col: Unassigned Work Queue */}
        <div className="space-y-4">
          <Card
            title="Unassigned Queue"
            subtitle={`${unassignedJobs.length} work orders awaiting dispatch`}
            action={
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="text-[10px] font-semibold rounded border border-slate-200 px-1.5 py-0.5 bg-white text-slate-700"
              >
                <option value="ALL">All</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            }
          >
            {/* Autonomous Dispatch Status inside Queue card */}
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 mb-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-[11px]">
                <Zap className="h-3.5 w-3.5 text-emerald-600" />
                <span>Autonomous Dispatch</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-200/60 px-2 py-0.5 rounded">
                {unassignedJobs.length === 0 ? 'Zero Unassigned' : 'Auto-Processing'}
              </span>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredUnassigned.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-slate-500 bg-emerald-50/40 rounded-lg border border-emerald-100">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-1.5" />
                  <div className="font-bold text-emerald-950">Zero Unassigned Work Orders</div>
                  <div className="text-[11px] text-emerald-700 mt-1">
                    All jobs are autonomously dispatched and scheduled to specialist timelines!
                  </div>
                </div>
              ) : (
                filteredUnassigned.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-slate-100/80 transition text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 truncate">{job.customerName}</span>
                      <PriorityBadge priority={job.priority} size="sm" />
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{job.description}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/60">
                      <span className="flex items-center gap-1 font-medium text-slate-600 truncate max-w-[130px]" title={formatServiceZoneAddress(job.serviceZone)}>
                        <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">{formatServiceZoneAddress(job.serviceZone, true)}</span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Auto-Dispatch Button (Unchanged) */}
                        <button
                          type="button"
                          disabled={dispatchingJobs[job.id]}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAutoDispatchSingle(job.id);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-2xs transition"
                          title="Find nearest specialist and dispatch live offer"
                        >
                          <Zap className="h-3 w-3" />
                          <span>{dispatchingJobs[job.id] ? 'Routing...' : 'Auto-Dispatch'}</span>
                        </button>

                        {/* Explain Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedJobId(job.id)}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-brand-700 font-semibold text-[10px] transition cursor-pointer"
                          title="AI Explainability"
                        >
                          <Sparkles className="h-3 w-3 text-brand-600" />
                          <span>Explain</span>
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          title="Edit Job Details"
                          onClick={() => handleOpenEdit(job)}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-[10px] transition cursor-pointer"
                        >
                          <Edit3 className="h-3 w-3" />
                          <span>Edit</span>
                        </button>

                        {/* Cancel Button */}
                        <button
                          type="button"
                          title="Cancel Job"
                          onClick={() => handleCancelAssignment(job.id)}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold text-[10px] transition cursor-pointer"
                        >
                          <XCircle className="h-3 w-3" />
                          <span>Cancel</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          title="Delete Job"
                          onClick={() => handleDeleteJob(job.id)}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-[10px] transition cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Live Cascade Progress Card */}
                    {activeCascades[job.id] && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 p-2 rounded-md bg-emerald-50 border border-emerald-300 text-[10px] text-emerald-950 space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1">
                            <Radio className="h-3 w-3 text-emerald-600 animate-ping" />
                            Offered: {activeCascades[job.id].currentOffer?.technicianName}
                          </span>
                          <span className="text-emerald-700 font-mono">
                            {activeCascades[job.id].currentOffer?.distanceKm} km (Rank {activeCascades[job.id].currentIndex + 1})
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-500">
                          Est. travel: {activeCascades[job.id].currentOffer?.travelTimeMinutes}m • Payout: ${activeCascades[job.id].currentOffer?.estimatedPayout}
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-emerald-200/80">
                          <span className="text-[9px] font-semibold text-slate-600">Simulate Response:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSimulate(job.id, 'ACCEPT')}
                              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px]"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSimulate(job.id, 'REJECT')}
                              className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold text-[9px]"
                              title="Declining triggers auto-cascade to 2nd closest specialist"
                            >
                              Decline (Cascade)
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Reusable Explainability Modal */}
      <ExplainabilityModal
        jobId={selectedJobId}
        isOpen={!!selectedJobId}
        onClose={() => setSelectedJobId(null)}
      />

      {/* Generate Schedule Modal */}
      <Modal
        isOpen={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        title="Execute Intelligent Workforce Scheduling"
        subtitle="Automatic multi-constraint shift dispatch and appointment assignment"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {schedError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{schedError}</span>
            </div>
          )}
          <p className="text-slate-600 leading-relaxed">
            The scheduling engine will automatically evaluate skill certifications, service zones, shift
            boundaries, SLA deadlines, travel transit matrices, and technician availability to construct an
            optimal schedule.
          </p>

          <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <h5 className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-brand-600" />
              Scoring Weights Configuration (%)
            </h5>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between mb-1">
                  <span>SLA Urgency & Compliance ({weights.slaUrgency}%)</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={50}
                  value={weights.slaUrgency}
                  onChange={(e) => setWeights({ ...weights, slaUrgency: Number(e.target.value) })}
                  className="w-full accent-brand-600"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>Travel Time Minimization ({weights.travelEfficiency}%)</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={50}
                  value={weights.travelEfficiency}
                  onChange={(e) => setWeights({ ...weights, travelEfficiency: Number(e.target.value) })}
                  className="w-full accent-brand-600"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>Workload Balance ({weights.workloadBalance}%)</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={40}
                  value={weights.workloadBalance}
                  onChange={(e) => setWeights({ ...weights, workloadBalance: Number(e.target.value) })}
                  className="w-full accent-brand-600"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" onClick={() => setGenerateModalOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleGenerateSchedule} isLoading={generating}>
              Run Scheduling Engine
            </Button>
          </div>
        </div>
      </Modal>
      {/* Edit Job Modal */}
      {editingJob && (
        <Modal
          isOpen={!!editingJob}
          onClose={() => setEditingJob(null)}
          title={`Edit Work Order #${editingJob.id.slice(0, 8)}`}
          subtitle="Update customer details, priority, and physical service location"
          maxWidth="md"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer Name</label>
              <input
                type="text"
                required
                value={editFormData.customerName}
                onChange={(e) => setEditFormData({ ...editFormData, customerName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Job Description</label>
              <textarea
                rows={2}
                required
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Priority</label>
                <select
                  value={editFormData.priority}
                  onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value as JobPriority })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Est. Duration (Mins)</label>
                <input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  value={editFormData.estimatedDuration}
                  onChange={(e) => setEditFormData({ ...editFormData, estimatedDuration: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Service Zone (Physical Address)</label>
              <select
                value={editFormData.serviceZone}
                onChange={(e) => setEditFormData({ ...editFormData, serviceZone: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none"
              >
                {Object.entries(ZONE_ADDRESS_MAP).map(([zoneKey, info]) => (
                  <option key={zoneKey} value={zoneKey}>
                    {info.address} ({info.label})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                Selected Address: {formatServiceZoneAddress(editFormData.serviceZone)}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setEditingJob(null)} disabled={savingEdit}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={savingEdit}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default SchedulingBoardPage;
