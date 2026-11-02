import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wrench,
  Clock,
  MapPin,
  CheckCircle2,
  Calendar,
  RefreshCw,
  Sliders,
  Power,
  Zap,
  Sparkles,
  DollarSign,
  TrendingUp,
  Award,
  ChevronRight,
  AlertCircle,
  Gift,
  Building,
  Check,
  X,
  Radio,
  Navigation,
  Truck,
} from 'lucide-react';
import {
  techniciansApi,
  jobsApi,
  autoDispatchApi,
} from '../services/dispatchApi';
import {
  Technician,
  Job,
  JobStatus,
} from '../types/dispatch';
import { useAuth } from '../context/AuthContext';
import { ensureArray } from '../utils/formatters';
import { formatServiceZoneAddress } from '../utils/zoneAddress';
import { LiveTrackingMap } from '../components/map/LiveTrackingMap';
import { useDispatchStream } from '../hooks/useDispatchStream';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { offlineDb } from '../utils/offlineDb';
import { RealtimeStatusBadge } from '../components/common/RealtimeStatusBadge';
import { WifiOff, Database } from 'lucide-react';

const ALL_SKILLS = [
  'HVAC',
  'ELECTRICAL',
  'PLUMBING',
  'APPLIANCE',
  'ROOFING',
  'SMART_HOME',
  'SECURITY',
  'EV_CHARGER',
];

const ALL_ZONES = [
  'ZONE_NORTH',
  'ZONE_SOUTH',
  'ZONE_EAST',
  'ZONE_WEST',
  'ZONE_CENTRAL',
];

export const TechnicianDashboardPage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { isOnline: networkOnline, syncState, pendingCount, lastSyncedAt, syncNow, executeAction } = useOfflineSync();
  const [isCachedData, setIsCachedData] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'schedule';

  const [tech, setTech] = useState<Technician | null>(null);
  const [assignedJobs, setAssignedJobs] = useState<Job[]>([]);

  // Real-time SSE stream hook for technician console
  const { status: streamStatus } = useDispatchStream({
    enabled: networkOnline,
    onEvent: (evt) => {
      if (!evt) return;
      if (
        evt.type === 'DISPATCH_STARTED' ||
        evt.type === 'TECHNICIAN_ASSIGNED' ||
        evt.type === 'JOB_REASSIGNED' ||
        evt.type === 'SCHEDULE_UPDATED' ||
        evt.type === 'JOB_UPDATED'
      ) {
        if (tech?.id) {
          pollActiveOffer(tech.id);
          fetchTechData();
        }
      }
    },
  });
  const [loading, setLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showEditSkills, setShowEditSkills] = useState(false);

  // Live incoming dispatch offer state
  const [activeOffer, setActiveOffer] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  // Earnings data
  const [earningsData, setEarningsData] = useState<any | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);

  // Discover data
  const [discoverData, setDiscoverData] = useState<any | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  // Edit skills state
  const [editSkills, setEditSkills] = useState<string[]>([]);
  const [editZones, setEditZones] = useState<string[]>([]);
  const [saveSkillsLoading, setSaveSkillsLoading] = useState(false);

  // Map modal & Lifecycle action states
  const [selectedMapJob, setSelectedMapJob] = useState<Job | null>(null);
  const [statusUpdatingJobId, setStatusUpdatingJobId] = useState<string | null>(null);

  const isOnline = tech?.availabilityStatus === 'AVAILABLE' || tech?.availabilityStatus === 'ON_SHIFT';

  const fetchTechData = useCallback(async () => {
    setLoading(true);
    try {
      if (!navigator.onLine) {
        const cachedJobs = await offlineDb.getCachedWorkOrders(user.id);
        const cachedTechs = await offlineDb.getCachedTechnicians();
        const found = cachedTechs.find(
          (t) =>
            t.id === user.technicianId ||
            t.name.toLowerCase() === user.name.toLowerCase()
        ) || cachedTechs[0];
        if (found) {
          setTech(found);
          setEditSkills(ensureArray(found.skills));
          setEditZones(ensureArray(found.serviceZones));
        }
        if (cachedJobs.length > 0) {
          setAssignedJobs(cachedJobs as any);
        }
        setIsCachedData(true);
        return;
      }

      let currentTech: Technician | null = null;
      if (user.technicianId) {
        const res = await techniciansApi.get(user.technicianId);
        currentTech = res.data;
      } else {
        const listRes = await techniciansApi.list({ limit: 50 });
        currentTech =
          listRes.data.find(
            (t) =>
              t.name.toLowerCase() === user.name.toLowerCase() ||
              t.email.toLowerCase() === user.email.toLowerCase()
          ) || listRes.data[0];
        offlineDb.cacheTechnicians(listRes.data).catch(() => {});
      }

      if (currentTech) {
        setTech(currentTech);
        setEditSkills(ensureArray(currentTech.skills));
        setEditZones(ensureArray(currentTech.serviceZones));

        const jobsRes = await jobsApi.list({ limit: 100 });
        const assigned = jobsRes.data.filter((j) =>
          j.assignments?.some((a: any) => a.technicianId === currentTech?.id)
        );
        setAssignedJobs(assigned);
        setIsCachedData(false);

        offlineDb.cacheWorkOrders(user.id, assigned).catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to load technician data, falling back to cache:', err);
      const cachedJobs = await offlineDb.getCachedWorkOrders(user.id);
      if (cachedJobs.length > 0) {
        setAssignedJobs(cachedJobs as any);
        setIsCachedData(true);
      }
    } finally {
      setLoading(false);
    }
  }, [user.technicianId, user.name, user.email, user.id]);

  // Fetch earnings
  const fetchEarnings = useCallback(async (techId: string) => {
    setEarningsLoading(true);
    try {
      const res = await autoDispatchApi.getEarnings(techId);
      setEarningsData(res.data);
    } catch (err) {
      console.warn('Failed to fetch earnings:', err);
    } finally {
      setEarningsLoading(false);
    }
  }, []);

  // Fetch discover data
  const fetchDiscover = useCallback(async () => {
    setDiscoverLoading(true);
    try {
      const res = await autoDispatchApi.getDiscoverOffers();
      setDiscoverData(res.data);
    } catch (err) {
      console.warn('Failed to fetch discover offers:', err);
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  // Live polling for incoming dispatch offers (every 3 seconds when online)
  const pollActiveOffer = useCallback(async (techId: string) => {
    try {
      const res = await autoDispatchApi.getActiveOffer(techId);
      if (res.data?.offer) {
        setActiveOffer(res.data.offer);
      } else {
        setActiveOffer(null);
      }
    } catch {
      // Quiet poll
    }
  }, []);

  useEffect(() => {
    fetchTechData();
    fetchDiscover();
  }, [fetchTechData, fetchDiscover]);

  useEffect(() => {
    if (tech?.id) {
      fetchEarnings(tech.id);
      pollActiveOffer(tech.id);

      // Replaced 3-second polling with real-time SSE stream events.
      // 30s slow heartbeat fallback for resilient edge recovery.
      const interval = setInterval(() => {
        if (navigator.onLine) {
          pollActiveOffer(tech.id);
        }
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [tech?.id, fetchEarnings, pollActiveOffer]);

  // Online / Offline Toggle
  const handleToggleOnline = async () => {
    if (!tech) return;
    setStatusUpdating(true);
    const newOnlineState = !isOnline;
    try {
      const res = await autoDispatchApi.updateOnlineStatus(tech.id, newOnlineState);
      setTech(res.data.technician);
      if (tech.id) {
        pollActiveOffer(tech.id);
      }
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    } finally {
      setStatusUpdating(false);
    }
  };

  // Accept Offer
  const handleAcceptOffer = async (jobId: string) => {
    if (!tech) return;
    setActionLoading(true);
    try {
      await autoDispatchApi.acceptOffer(jobId, tech.id);
      setActiveOffer(null);
      await fetchTechData();
      await fetchEarnings(tech.id);
      setSearchParams({ tab: 'schedule' });
    } catch (err: any) {
      alert(`Failed to accept offer: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Reject Offer
  const handleRejectOffer = async (jobId: string) => {
    if (!tech) return;
    setActionLoading(true);
    try {
      const res = await autoDispatchApi.rejectOffer(jobId, tech.id, declineReason || 'Specialist unavailable');
      setActiveOffer(null);
      setShowDeclineModal(false);
      setDeclineReason('');
      alert(res.data.message || 'Offer declined and automatically routed to the second closest technician.');
    } catch (err: any) {
      alert(`Failed to decline offer: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Specialist Lifecycle Actions: [ Start Route ] -> [ Arrived at Location ] -> [ Start Repair ] -> [ Complete & Invoice ]
  const handleLifecycleTransition = async (jobId: string, nextStatus: JobStatus) => {
    setStatusUpdatingJobId(jobId);
    try {
      // Optimistic instant state update
      setAssignedJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: nextStatus } : j))
      );

      // Safe offline-first execution via sync manager
      const opResult = await executeAction(jobId, 'UPDATE_STATUS', { status: nextStatus });
      if (opResult.queued) {
        setSyncNotice(`Job #${jobId.slice(0, 8)} status marked as ${nextStatus} locally. Queued for background synchronization.`);
        setTimeout(() => setSyncNotice(null), 5000);
      } else {
        await fetchTechData();
        if (nextStatus === 'COMPLETED' && tech?.id) {
          await fetchEarnings(tech.id);
        }
      }
    } catch (err: any) {
      console.warn('Status transition error:', err);
      alert(`Could not update status: ${err.message}`);
      await fetchTechData();
    } finally {
      setStatusUpdatingJobId(null);
    }
  };

  const handleSaveSkills = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tech) return;
    setSaveSkillsLoading(true);
    try {
      const res = await techniciansApi.update(tech.id, {
        skills: editSkills,
        serviceZones: editZones,
      });
      setTech(res.data);
      updateUser({ skills: editSkills, serviceZones: editZones });
      setShowEditSkills(false);
    } catch (err: any) {
      alert(`Failed to save skills: ${err.message}`);
    } finally {
      setSaveSkillsLoading(false);
    }
  };

  const toggleEditSkill = (skill: string) => {
    setEditSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const toggleEditZone = (zone: string) => {
    setEditZones((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Offline Notice Banner */}
      {(!networkOnline || isCachedData) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
              <WifiOff className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-amber-900 flex items-center gap-2">
                <span>Field Specialist Offline PWA Mode Active</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-800">
                  Cached Work Orders
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                You can continue to view appointments, mark arrival, and record repair completion offline. All actions will automatically synchronize when connection resumes.
                {lastSyncedAt ? ` Last synced at ${new Date(lastSyncedAt).toLocaleTimeString()}.` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RealtimeStatusBadge
              streamStatus={streamStatus}
              isOnline={networkOnline}
              syncState={syncState}
              pendingCount={pendingCount}
              lastSyncedAt={lastSyncedAt}
              onSyncNow={syncNow}
            />
            {pendingCount > 0 && (
              <button
                onClick={syncNow}
                disabled={syncState === 'SYNCING'}
                className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition shadow-xs"
              >
                <Database className="h-3.5 w-3.5" />
                <span>Sync {pendingCount} Updates</span>
              </button>
            )}
          </div>
        </div>
      )}

      {syncNotice && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-xs text-blue-900 font-medium">
          {syncNotice}
        </div>
      )}

      {/* 1. Header Banner & Prominent Online / Offline Toggle */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-6 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                <Wrench className="h-3 w-3" /> Field Specialist Console
              </span>
              <span className="text-xs text-slate-400">• ID: {tech?.id.slice(0, 8) || 'Active'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
              <span>{tech?.name || user.name || 'Field Specialist'}</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300 max-w-xl">
              Shift: {tech?.shiftStart || '08:00'} - {tech?.shiftEnd || '17:00'} UTC • Live Automated Nearest-Neighbor Dispatch Active
            </p>
          </div>

          {/* Online / Offline Toggle Control */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-950/60 p-3 sm:p-4 rounded-xl border border-slate-700/60">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Dispatch Availability
              </div>
              <div className="text-sm font-extrabold flex items-center gap-2 mt-0.5">
                {isOnline ? (
                  <>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-emerald-400">Online • Taking Jobs</span>
                  </>
                ) : (
                  <>
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500"></span>
                    <span className="text-slate-400">Offline • Shift Paused</span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={statusUpdating}
              onClick={handleToggleOnline}
              className={`relative inline-flex h-9 items-center gap-2 px-4 rounded-lg text-xs font-extrabold transition-all shadow-md ${
                isOnline
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
            >
              <Power className={`h-4 w-4 ${statusUpdating ? 'animate-spin' : ''}`} />
              <span>{isOnline ? 'Go Offline' : 'Go Online'}</span>
            </button>
          </div>
        </div>

        {/* Live Incoming Offer Pulsing Notification Alert (If active offer exists) */}
        {activeOffer && (
          <div className="mt-6 rounded-xl border-2 border-emerald-400 bg-emerald-950/90 p-4 sm:p-5 text-white shadow-2xl animate-pulse">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-slate-950 flex items-center gap-1">
                    <Radio className="h-3 w-3 animate-ping" /> INCOMING JOB DISPATCH OFFER
                  </span>
                  <span className="text-xs text-emerald-300 font-semibold">
                    Nearest Match: {activeOffer.distanceKm} km away • ~{activeOffer.travelTimeMinutes} mins travel
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {activeOffer.job.description}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-200">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {activeOffer.job.serviceZone}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {activeOffer.job.estimatedDuration} mins
                  </span>
                  <span>•</span>
                  <span className="font-extrabold text-amber-300 flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" /> Payout: ${activeOffer.estimatedPayout}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAcceptOffer(activeOffer.job.id)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg transition-transform active:scale-95"
                >
                  <Check className="h-4 w-4" /> ACCEPT JOB
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setShowDeclineModal(true)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 px-3 py-2.5 text-xs font-bold text-white transition-colors"
                >
                  <X className="h-4 w-4" /> Decline
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Navigation Tabs (Schedule, Live Offers, Discover, Earnings, Profile) */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl px-2 shadow-2xs overflow-x-auto">
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'schedule' })}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'schedule'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="h-4 w-4" />
          <span>My Schedule & Tasks ({assignedJobs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'offers' })}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'offers'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Zap className="h-4 w-4" />
          <span>Live Job Offers</span>
          {activeOffer && (
            <span className="rounded-full bg-emerald-500 px-1.5 py-0.2 text-[10px] text-white font-extrabold animate-bounce">
              1
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'discover' })}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'discover'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="h-4 w-4 text-brand-600" />
          <span>Company Discover & Offers</span>
          <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[9px] font-bold">
            Surge
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'earnings' })}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'earnings'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="h-4 w-4 text-emerald-600" />
          <span>Earnings & Working Hours</span>
        </button>

        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'profile' })}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'profile'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Skills & Zones</span>
        </button>
      </div>

      {/* 3. TAB CONTENT */}

      {/* TAB 1: SCHEDULE & TASKS */}
      {activeTab === 'schedule' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Today's Active Schedule</h2>
              <p className="text-xs text-slate-500">
                Assigned work orders sorted by scheduled execution window
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchTechData()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-brand-600" />
              <span>Loading assignments...</span>
            </div>
          ) : assignedJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 space-y-2">
              <Calendar className="h-8 w-8 mx-auto text-slate-400" />
              <div className="text-sm font-bold text-slate-700">No Jobs Assigned Yet</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Your status is {isOnline ? 'Online' : 'Offline'}. When online, new appointments in your certified zones will be dispatched to you automatically!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {assignedJobs.map((job) => {
                const assignment = job.assignments?.find((a: any) => a.technicianId === tech?.id);
                return (
                  <div
                    key={job.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-brand-300 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-slate-400">
                            #{job.id.slice(0, 8)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                              job.priority === 'CRITICAL'
                                ? 'bg-red-100 text-red-800'
                                : job.priority === 'HIGH'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {job.priority} Priority
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              job.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {job.status}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900">{job.description}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Customer: {job.customerName}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedMapJob(job)}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-colors"
                          title="View customer destination and route navigation"
                        >
                          <Navigation className="h-4 w-4 text-brand-600" />
                          <span>Route Map</span>
                        </button>

                        {(job.status === 'ASSIGNED' || job.status === 'PENDING') && (
                          <button
                            type="button"
                            onClick={() => handleLifecycleTransition(job.id, 'EN_ROUTE')}
                            disabled={statusUpdatingJobId === job.id}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
                          >
                            <Truck className="h-4 w-4" /> Start Route
                          </button>
                        )}

                        {job.status === 'EN_ROUTE' && (
                          <button
                            type="button"
                            onClick={() => handleLifecycleTransition(job.id, 'ARRIVED')}
                            disabled={statusUpdatingJobId === job.id}
                            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer animate-pulse"
                          >
                            <MapPin className="h-4 w-4" /> Arrived at Location
                          </button>
                        )}

                        {job.status === 'ARRIVED' && (
                          <button
                            type="button"
                            onClick={() => handleLifecycleTransition(job.id, 'IN_PROGRESS')}
                            disabled={statusUpdatingJobId === job.id}
                            className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
                          >
                            <Wrench className="h-4 w-4" /> Start Repair
                          </button>
                        )}

                        {job.status === 'IN_PROGRESS' && (
                          <button
                            type="button"
                            onClick={() => handleLifecycleTransition(job.id, 'COMPLETED')}
                            disabled={statusUpdatingJobId === job.id}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="h-4 w-4" /> Complete & Invoice
                          </button>
                        )}

                        {job.status === 'COMPLETED' && (
                          <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Completed & Invoiced
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-700 font-semibold flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <span>Address: {formatServiceZoneAddress(job.serviceZone)}</span>
                    </div>

                    {/* Specialist Lifecycle Stepper Bar */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                        {[
                          { key: 'ASSIGNED', label: '1. Assigned' },
                          { key: 'EN_ROUTE', label: '2. En Route' },
                          { key: 'ARRIVED', label: '3. Arrived' },
                          { key: 'IN_PROGRESS', label: '4. Repairing' },
                          { key: 'COMPLETED', label: '5. Invoiced' },
                        ].map((step) => {
                          const order = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
                          const currentIdx = order.indexOf(job.status);
                          const thisStepIdx = order.indexOf(step.key);
                          const isPastOrCurrent = currentIdx >= thisStepIdx;
                          const isCurrent = job.status === step.key;

                          return (
                            <div key={step.key} className="flex flex-col items-center flex-1">
                              <div
                                className={`h-1.5 w-full rounded-full mb-1 transition-all ${
                                  isCurrent
                                    ? 'bg-brand-600'
                                    : isPastOrCurrent
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-200'
                                }`}
                              />
                              <span
                                className={`${
                                  isCurrent
                                    ? 'text-brand-600 font-extrabold'
                                    : isPastOrCurrent
                                    ? 'text-emerald-700'
                                    : 'text-slate-400'
                                }`}
                              >
                                {step.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs text-slate-600">
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase">
                          Zone
                        </span>
                        <span className="font-semibold">{job.serviceZone}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase">
                          Duration
                        </span>
                        <span>{job.estimatedDuration} mins</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase">
                          Scheduled Start
                        </span>
                        <span>
                          {assignment?.scheduledStart
                            ? new Date(assignment.scheduledStart).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Pending Slot'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase">
                          Estimated Payout
                        </span>
                        <span className="font-extrabold text-emerald-600">
                          ${job.priority === 'CRITICAL' ? 75 : 55}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LIVE JOB OFFERS & CASCADES */}
      {activeTab === 'offers' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" /> Live Automated Allocation Board
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              DispatchGrid automatically calculates great-circle travel distance and routes jobs to the nearest specialist who possesses the required skill.
              If the nearest technician declines, the offer immediately cascades to the second closest technician in real-time.
            </p>

            {activeOffer ? (
              <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50/70 p-5">
                <div className="flex items-center justify-between pb-3 border-b border-emerald-200/60">
                  <span className="rounded-md bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase">
                    Active Offer Waiting for you
                  </span>
                  <span className="text-xs font-semibold text-emerald-800">
                    Calculated Distance: {activeOffer.distanceKm} km
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">{activeOffer.job.description}</h3>
                  <div className="text-xs text-slate-600 flex flex-wrap gap-4">
                    <span>Customer: <strong className="text-slate-800">{activeOffer.job.customerName}</strong></span>
                    <span>Zone: <strong className="text-slate-800">{activeOffer.job.serviceZone}</strong></span>
                    <span>Duration: <strong className="text-slate-800">{activeOffer.job.estimatedDuration} mins</strong></span>
                    <span>Payout: <strong className="text-emerald-700 font-extrabold text-sm">${activeOffer.estimatedPayout}</strong></span>
                  </div>
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleAcceptOffer(activeOffer.job.id)}
                    className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 py-2.5 text-xs font-bold text-white shadow-sm transition-colors text-center"
                  >
                    {actionLoading ? 'Assigning...' : 'Accept Job & Schedule Window'}
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setShowDeclineModal(true)}
                    className="px-4 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-600 py-2.5 text-xs font-bold transition-colors"
                  >
                    Decline (Cascade to Next)
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 p-8 text-center text-slate-500 rounded-xl bg-slate-50 border border-slate-200">
                <Radio className="h-6 w-6 mx-auto text-slate-400 mb-2 animate-pulse" />
                <div className="text-sm font-bold text-slate-700">Listening for Dispatch Calls</div>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Keep your status set to <strong className="text-emerald-600">Online</strong>. When the dispatch engine or admin starts job allocation, you will be alerted if you are the nearest match.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: COMPANY DISCOVER & OFFERS */}
      {activeTab === 'discover' && (
        <div className="space-y-6">
          {/* Company Announcements / Campaigns */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-brand-600" /> Active Company Perks & Incentive Campaigns
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Exclusive bonuses, equipment discounts, and surge rates available for certified DispatchGrid technicians
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-bold">
                4 Active Offers
              </span>
            </div>

            {discoverLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-brand-600" />
                Loading offers...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {discoverData?.announcements?.map((offer: any) => (
                  <div
                    key={offer.id}
                    className="rounded-xl border border-slate-200 p-5 bg-gradient-to-br from-white to-slate-50/50 hover:border-brand-300 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-extrabold text-brand-700 uppercase">
                          {offer.tag}
                        </span>
                        <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                          {offer.payoutBonus}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{offer.title}</h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        {offer.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Valid: <strong className="text-slate-600">{offer.validUntil}</strong></span>
                      <span className="font-semibold text-brand-600 flex items-center gap-1 hover:underline cursor-pointer">
                        Details <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* High Demand Zones Tracker */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Real-time High Demand Surge Zones
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Move towards high-demand zones to receive immediate automatic job dispatches with higher commission multipliers
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {discoverData?.highDemandZones?.map((z: any) => (
                <div key={z.zone} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-slate-800">{z.zone}</span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                        z.demandLevel === 'CRITICAL'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {z.demandLevel}
                    </span>
                  </div>
                  <div className="text-lg font-black text-emerald-600">{z.surgeMultiplier} Surge</div>
                  <div className="text-xs text-slate-500 mt-0.5">{z.openJobs} unassigned appointments</div>
                </div>
              ))}
            </div>
          </div>

          {/* Company Tool & Safety Perks */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
              <Gift className="h-4 w-4 text-purple-600" /> Commercial Tool & Health Benefits
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Discount codes and equipment sponsorship for verified active contractors
            </p>

            <div className="space-y-3">
              {discoverData?.companyPerks?.map((perk: any) => (
                <div
                  key={perk.name}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                      <Building className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{perk.name}</div>
                      <div className="text-[11px] text-slate-500">{perk.partner} • {perk.discount}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-slate-700">
                      {perk.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => alert(`Copied coupon code: ${perk.code}`)}
                      className="text-xs font-bold text-brand-600 hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: EARNINGS & WORKING HOURS */}
      {activeTab === 'earnings' && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Gross Earnings</span>
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                ${earningsData?.grossEarnings || 0}
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-1">
                +${earningsData?.bonusIncentives || 0} bonus included
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Total Time Worked</span>
                <Clock className="h-4 w-4 text-brand-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                {earningsData?.totalHoursWorked || 0} <span className="text-sm font-semibold text-slate-400">hrs</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {earningsData?.serviceHours || 0}h on-site • {earningsData?.travelHours || 0}h transit
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Effective Hourly</span>
                <TrendingUp className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                ${earningsData?.hourlyEffectiveRate || 42.50} <span className="text-sm font-semibold text-slate-400">/hr</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Base + Tips + Surge payouts
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Jobs Completed</span>
                <Award className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                {earningsData?.completedJobsCount || 0}
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-1">
                ★ 4.9 rating • 98.5% completion
              </div>
            </div>
          </div>

          {/* Earnings Breakdown Ledger */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-4 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Completed Service Job Ledger</h3>
                <p className="text-xs text-slate-500">
                  Itemized payouts and tips for your completed service appointments
                </p>
              </div>
              <button
                type="button"
                onClick={() => tech?.id && fetchEarnings(tech.id)}
                className="text-xs font-bold text-brand-600 hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${earningsLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {earningsData?.completedJobs && earningsData.completedJobs.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {earningsData.completedJobs.map((job: any) => (
                  <div key={job.jobId} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-slate-400">
                          #{job.jobId.slice(0, 8)}
                        </span>
                        <span className="text-xs font-bold text-slate-800">{job.serviceDescription}</span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-3">
                        <span>Client: {job.customerName}</span>
                        <span>•</span>
                        <span>Duration: {job.durationMinutes}m (+{job.travelTimeMinutes}m transit)</span>
                        <span>•</span>
                        <span>Zone: {job.serviceZone}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-black text-emerald-600">
                        +${job.totalEarnings}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Base: ${job.basePayout} • Tip: ${job.tip}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                No completed service jobs recorded yet. Once you complete jobs from your schedule, your earnings ledger will populate here!
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: SKILLS & ZONES PROFILE */}
      {activeTab === 'profile' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Area of Expertise & Certified Skills</h2>
              <p className="text-xs text-slate-500">
                These qualifications are used by the automated nearest-neighbor dispatch algorithm
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowEditSkills(true)}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs"
            >
              Edit Qualifications
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Certified Service Skills ({ensureArray(tech?.skills).length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {ensureArray(tech?.skills).map((skill: string) => (
                  <span
                    key={skill}
                    className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-1.5 text-xs font-bold text-brand-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Authorized Service Zones ({ensureArray(tech?.serviceZones).length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {ensureArray(tech?.serviceZones).map((zone: string) => (
                  <span
                    key={zone}
                    className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700"
                  >
                    {zone}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DECLINE OFFER MODAL */}
      {showDeclineModal && activeOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" /> Decline Job Offer
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Declining will automatically cascade this appointment to the <strong>second closest qualified specialist</strong>.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Declining (Optional)
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Currently finishing emergency repair, shift ending soon, or tool restocking required..."
                rows={3}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowDeclineModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleRejectOffer(activeOffer.job.id)}
                className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
              >
                {actionLoading ? 'Declining...' : 'Confirm & Re-route to Next Tech'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SKILLS MODAL */}
      {showEditSkills && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Update Area of Expertise & Zones</h3>
            <p className="text-xs text-slate-500 mt-1">
              Save your certified trades so the dispatch engine matches appropriate customer requests.
            </p>

            <form onSubmit={handleSaveSkills} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Select Certified Skills
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_SKILLS.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleEditSkill(skill)}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border text-left transition-all flex items-center justify-between ${
                        editSkills.includes(skill)
                          ? 'border-brand-500 bg-brand-50 text-brand-700 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>{skill}</span>
                      {editSkills.includes(skill) && <Check className="h-3.5 w-3.5 text-brand-600" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Select Authorized Service Zones
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ZONES.map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => toggleEditZone(zone)}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border text-left transition-all flex items-center justify-between ${
                        editZones.includes(zone)
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>{zone}</span>
                      {editZones.includes(zone) && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditSkills(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveSkillsLoading}
                  className="rounded-lg bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
                >
                  {saveSkillsLoading ? 'Saving...' : 'Save & Sync Roster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INTERACTIVE ROUTE MAP MODAL */}
      {selectedMapJob && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl">
            <LiveTrackingMap
              technicianName={tech?.name || 'Field Specialist'}
              technicianPhone={tech?.phone || '+1-555-0100'}
              technicianLat={tech?.latitude}
              technicianLng={tech?.longitude}
              destinationAddress={formatServiceZoneAddress(selectedMapJob.serviceZone)}
              destinationLat={selectedMapJob.latitude || 37.7749}
              destinationLng={selectedMapJob.longitude || -122.4194}
              jobStatus={selectedMapJob.status}
              jobDescription={selectedMapJob.description}
              onClose={() => setSelectedMapJob(null)}
              heightClass="h-[440px]"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TechnicianDashboardPage;
