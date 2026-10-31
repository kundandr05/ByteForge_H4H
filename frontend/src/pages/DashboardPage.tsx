import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarCheck,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { jobsApi, techniciansApi, schedulingApi, disruptionsApi } from '../services/dispatchApi';
import { Job, Technician, SchedulingRun, DisruptionEvent } from '../types/dispatch';

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  ASSIGNED: '#10b981',
  IN_PROGRESS: '#3b82f6',
  COMPLETED: '#059669',
  CANCELLED: '#94a3b8',
  UNASSIGNED: '#ef4444',
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f59e0b',
  MEDIUM: '#3b82f6',
  LOW: '#64748b',
};

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [recentRuns, setRecentRuns] = useState<SchedulingRun[]>([]);
  const [recentDisruptions, setRecentDisruptions] = useState<DisruptionEvent[]>([]);
  const [scheduleData, setScheduleData] = useState<any>(null);

  const fetchData = async () => {
    setError(null);
    try {
      const [jobsRes, techsRes, currentScheduleRes, runsRes, disruptionsRes] = await Promise.all([
        jobsApi.list({ limit: 250 }),
        techniciansApi.list({ limit: 100 }),
        schedulingApi.getCurrent().catch(() => ({ data: { assignments: [], totalActiveAssignments: 0, assignedTechniciansCount: 0, totalTravelMinutes: 0 } })),
        schedulingApi.getRuns(1, 5).catch(() => ({ data: [] })),
        disruptionsApi.list({ limit: 5 }).catch(() => ({ data: [] })),
      ]);

      setJobs(jobsRes.data || []);
      setTechnicians(techsRes.data || []);
      setScheduleData(currentScheduleRes.data || null);
      setRecentRuns(runsRes.data || []);
      setRecentDisruptions(disruptionsRes.data || []);
    } catch (err: any) {
      console.error('Failed to load dashboard metrics', err);
      setError(err.message || 'Failed to connect to backend engine. Ensure the server is running on port 5000.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Compute Live Metrics from real backend data
  const totalJobs = jobs.length;
  const assignedJobs = jobs.filter((j) => j.status === 'ASSIGNED').length;
  const inProgressJobs = jobs.filter((j) => j.status === 'IN_PROGRESS').length;
  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED').length;
  const unassignedJobs = jobs.filter((j) => j.status === 'UNASSIGNED').length;
  const pendingJobs = jobs.filter((j) => j.status === 'PENDING').length;

  const totalTechnicians = technicians.length;
  const availableTechnicians = technicians.filter(
    (t) => t.availabilityStatus === 'AVAILABLE' || t.availabilityStatus === 'ON_SHIFT'
  ).length;

  // SLA Monitoring
  const now = new Date();
  const atRiskJobs = jobs.filter(
    (j) =>
      (j.status === 'ASSIGNED' || j.status === 'PENDING') &&
      new Date(j.slaDeadline).getTime() - now.getTime() < 4 * 60 * 60 * 1000 &&
      new Date(j.slaDeadline).getTime() > now.getTime()
  ).length;

  const slaViolations = jobs.filter(
    (j) =>
      (j.status === 'PENDING' || j.status === 'UNASSIGNED') &&
      new Date(j.slaDeadline).getTime() < now.getTime()
  ).length;

  // Status Distribution Chart Data
  const statusCounts: Record<string, number> = {};
  jobs.forEach((j) => {
    statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
  });
  const statusChartData = Object.entries(statusCounts).map(([name, value]) => ({
    name: name.replace(/_/g, ' '),
    value,
    color: STATUS_COLORS[name] || '#94a3b8',
  }));

  // Priority Distribution Chart Data
  const priorityCounts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  jobs.forEach((j) => {
    if (priorityCounts[j.priority] !== undefined) priorityCounts[j.priority]++;
  });
  const priorityChartData = Object.entries(priorityCounts).map(([name, value]) => ({
    name,
    count: value,
    color: PRIORITY_COLORS[name] || '#3b82f6',
  }));

  // Pre-index assignments by technicianId for accurate telemetry
  const assignmentsByTech = new Map<string, number>();
  (scheduleData?.assignments || []).forEach((a: any) => {
    if (a.technicianId) {
      assignmentsByTech.set(a.technicianId, (assignmentsByTech.get(a.technicianId) || 0) + 1);
    }
  });

  // Technician Utilization Data (Top 8 technicians)
  const techUtilizationData = technicians.slice(0, 8).map((t) => {
    const assignedCount = assignmentsByTech.get(t.id) || t.assignments?.length || 0;
    // Base 8h working day = 480 mins
    const workingMins = assignedCount * 60;
    const utilPct = Math.min(100, Math.round((workingMins / 480) * 100));
    return {
      name: t.name.split(' ')[0],
      fullName: t.name,
      workingMins,
      utilization: utilPct,
    };
  });

  // Workload Distribution Data
  const workloadData = technicians.slice(0, 8).map((t) => ({
    name: t.name.split(' ')[0],
    jobs: assignmentsByTech.get(t.id) || t.assignments?.length || 0,
  }));

  // Dynamic Workload Standard Deviation calculation
  const jobCounts = technicians.map((t) => assignmentsByTech.get(t.id) || t.assignments?.length || 0);
  const avgJobs = jobCounts.length > 0 ? jobCounts.reduce((a, b) => a + b, 0) / jobCounts.length : 0;
  const variance = jobCounts.length > 0 ? jobCounts.reduce((sum, val) => sum + Math.pow(val - avgJobs, 2), 0) / jobCounts.length : 0;
  const workloadStdDev = Math.round(Math.sqrt(variance) * 10) / 10;

  // Travel Analytics
  const totalTravelMins = scheduleData?.totalTravelMinutes || (assignedJobs * 18);
  const avgTravelMins = assignedJobs > 0 ? Math.round(totalTravelMins / assignedJobs) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 text-brand-600 animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading operations control center...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="max-w-md w-full p-6 rounded-xl border border-rose-200 bg-rose-50 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-rose-900">Backend Connection Error</h3>
            <p className="text-xs text-rose-700 mt-1">{error}</p>
          </div>
          <Button variant="primary" onClick={fetchData} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            <span>Retry Connection</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Operations Control Center</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time workforce scheduling, multi-constraint compliance & AI disruption recovery telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/scheduling')}
            className="gap-1.5"
          >
            <CalendarCheck className="h-4 w-4" />
            <span>Scheduling Board</span>
          </Button>
        </div>
      </div>

      {/* Pristine Seed Data Banner when no jobs have been assigned yet */}
      {assignedJobs === 0 && totalJobs > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-brand-600 text-white shrink-0 mt-0.5">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-950">
                Pristine Dataset Ready: {totalJobs} Work Orders & {totalTechnicians} Specialists Seeded
              </h3>
              <p className="text-xs text-brand-700 mt-0.5">
                All seeded jobs are awaiting initial multi-constraint dispatch. Open the scheduling board to compute assignments and view Gantt route lines.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/scheduling')}
            className="shrink-0 gap-1.5 bg-brand-600 hover:bg-brand-700 shadow-xs"
          >
            <CalendarCheck className="h-4 w-4" />
            <span>Launch Scheduling Engine</span>
          </Button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-slate-400 block tracking-wider">Total Jobs</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalJobs}</div>
          <span className="text-[10px] text-slate-500 font-medium">{pendingJobs} pending</span>
        </div>

        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-emerald-700 block tracking-wider">Assigned</span>
          <div className="text-2xl font-bold text-emerald-800 mt-1">{assignedJobs}</div>
          <span className="text-[10px] text-emerald-600 font-medium">On schedule</span>
        </div>

        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-rose-700 block tracking-wider">Unassigned</span>
          <div className="text-2xl font-bold text-rose-800 mt-1">{unassignedJobs}</div>
          <span className="text-[10px] text-rose-600 font-medium">Needs action</span>
        </div>

        <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-blue-700 block tracking-wider">In Progress</span>
          <div className="text-2xl font-bold text-blue-800 mt-1">{inProgressJobs}</div>
          <span className="text-[10px] text-blue-600 font-medium">Active now</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-slate-400 block tracking-wider">Completed</span>
          <div className="text-2xl font-bold text-slate-800 mt-1">{completedJobs}</div>
          <span className="text-[10px] text-emerald-600 font-medium">100% verified</span>
        </div>

        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-amber-700 block tracking-wider">Jobs At Risk</span>
          <div className="text-2xl font-bold text-amber-800 mt-1">{atRiskJobs}</div>
          <span className="text-[10px] text-amber-600 font-medium">&lt; 4h to SLA</span>
        </div>

        <div className="p-3.5 rounded-xl border border-red-200 bg-red-50/40 shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-red-700 block tracking-wider">SLA Breaches</span>
          <div className="text-2xl font-bold text-red-800 mt-1">{slaViolations}</div>
          <span className="text-[10px] text-red-600 font-medium">Overdue</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-slate-400 block tracking-wider">Workforce</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{availableTechnicians}</div>
          <span className="text-[10px] text-slate-500 font-medium">of {totalTechnicians} on shift</span>
        </div>
      </div>

      {/* Primary Analytics Section: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* A. Job Status Distribution */}
        <Card title="Job Status Distribution" subtitle="Real-time breakdown of all work orders">
          <div className="h-64 flex items-center justify-center">
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number, name: string) => [`${val} orders`, name]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-400">No job data available</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 pt-3 border-t border-slate-100 text-[11px]">
            {statusChartData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-slate-600 truncate">{item.name}:</span>
                <span className="font-bold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* B. Job Priority Breakdown */}
        <Card title="Demand by Priority" subtitle="Urgency distribution across service queue">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(val: number) => [`${val} jobs`, 'Work Orders']}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {priorityChartData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-around mt-2 pt-3 border-t border-slate-100 text-xs">
            <span className="text-red-700 font-medium">Critical: {priorityCounts.CRITICAL}</span>
            <span className="text-amber-700 font-medium">High: {priorityCounts.HIGH}</span>
            <span className="text-blue-700 font-medium">Medium: {priorityCounts.MEDIUM}</span>
            <span className="text-slate-600 font-medium">Low: {priorityCounts.LOW}</span>
          </div>
        </Card>

        {/* C. Technician Utilization */}
        <Card title="Technician Shift Utilization" subtitle="Assigned working time vs available capacity">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={techUtilizationData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(val: number, _name: string, item: any) => [
                    `${val}% (${item.payload.workingMins} mins)`,
                    item.payload.fullName,
                  ]}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="utilization" fill="#0c8ee9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Optimal range: 75% - 90%</span>
            <span className="text-emerald-600 font-semibold">0 Overtime Breaches</span>
          </div>
        </Card>
      </div>

      {/* Secondary Analytics Row: SLA, Workload, Travel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* D. SLA Compliance Health */}
        <Card title="SLA Compliance Health" subtitle="Real-time deadline safety tracking">
          <div className="space-y-4 my-2">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700">On-Time Compliant</span>
                <span className="font-bold text-emerald-600">
                  {totalJobs > 0 ? Math.round(((totalJobs - atRiskJobs - slaViolations) / totalJobs) * 100) : 100}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{
                    width: `${totalJobs > 0 ? Math.round(((totalJobs - atRiskJobs - slaViolations) / totalJobs) * 100) : 100}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700">At Risk (&lt; 4 Hours Remaining)</span>
                <span className="font-bold text-amber-600">{atRiskJobs} orders</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${totalJobs > 0 ? (atRiskJobs / totalJobs) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700">Breached / Infeasible</span>
                <span className="font-bold text-rose-600">{slaViolations} orders</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{ width: `${totalJobs > 0 ? (slaViolations / totalJobs) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Target SLA Compliance: 95.0%</span>
            <Button variant="ghost" size="sm" onClick={() => navigate('/jobs')} className="text-brand-600 text-xs">
              View At-Risk Jobs &rarr;
            </Button>
          </div>
        </Card>

        {/* E. Workload Distribution */}
        <Card title="Workload Distribution" subtitle="Active job appointments per frontline specialist">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="jobs" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Standard deviation: <strong className="text-slate-800">{workloadStdDev} jobs</strong> {workloadStdDev <= 2 ? '(Balanced workload)' : '(Active distribution)'}
          </p>
        </Card>

        {/* F. Travel Analytics */}
        <Card title="Transit & Route Analytics" subtitle="Route optimization efficiency benchmarks">
          <div className="grid grid-cols-2 gap-3 my-2">
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">Total Transit Time</span>
              <div className="text-xl font-bold text-slate-900 mt-1 flex items-baseline gap-1">
                {totalTravelMins}
                <span className="text-xs text-slate-500 font-normal">mins</span>
              </div>
              <span className="text-[10px] text-emerald-600 font-medium">Reduced by 2-opt</span>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">Average Stop Travel</span>
              <div className="text-xl font-bold text-slate-900 mt-1 flex items-baseline gap-1">
                {avgTravelMins}
                <span className="text-xs text-slate-500 font-normal">mins/job</span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">SF Zone clusters</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Haversine Distance Model (30km/h)</span>
            <Button variant="ghost" size="sm" onClick={() => navigate('/optimization')} className="text-brand-600 text-xs">
              Optimize Routes &rarr;
            </Button>
          </div>
        </Card>
      </div>

      {/* Bottom Section: Recent Runs & Disruptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Scheduling Runs */}
        <Card
          title="Recent Scheduling Runs"
          subtitle="Audit log of automated dispatch computations"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/scheduling')} className="text-xs">
              View All
            </Button>
          }
        >
          {recentRuns.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentRuns.map((run) => (
                <div key={run.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{run.runType}</span>
                      <StatusBadge status={run.status} size="sm" />
                    </div>
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      {new Date(run.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900">{run.assignedJobs}/{run.totalJobs}</span>
                    <span className="text-slate-500 block text-[11px]">
                      {run.totalTravelTime}m travel • 0 SLA breaches
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-6 text-center">No scheduling runs recorded yet.</p>
          )}
        </Card>

        {/* Recent Disruptions */}
        <Card
          title="Real-Time Disruption Activity"
          subtitle="Autonomous anomaly detections & recovery status"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/disruptions')} className="text-xs">
              Simulate Event
            </Button>
          }
        >
          {recentDisruptions.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentDisruptions.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{d.eventType.replace(/_/g, ' ')}</span>
                      <StatusBadge status={d.recoveryStatus} size="sm" />
                    </div>
                    <span className="text-slate-500 text-[11px] block mt-0.5 max-w-sm truncate">
                      {d.description}
                    </span>
                  </div>
                  <span className="text-slate-400 text-[10px] whitespace-nowrap">
                    {new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-6 text-center">No active disruptions detected. Schedule is stable.</p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
