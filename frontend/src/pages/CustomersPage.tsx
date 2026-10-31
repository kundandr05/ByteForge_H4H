import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  MapPin,
  AlertCircle,
  RefreshCw,
  Eye,
  X,
  Briefcase,
} from 'lucide-react';
import { customersApi, CustomerSummary } from '../services/dispatchApi';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await customersApi.list();
      setCustomers(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load customer roster.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.serviceZones.some((z) => z.toLowerCase().includes(search.toLowerCase())) ||
      c.preferredSkills.some((s) => s.toLowerCase().includes(search.toLowerCase()))
  );

  const totalClients = customers.length;
  const totalBookings = customers.reduce((sum, c) => sum + c.totalAppointments, 0);
  const totalActive = customers.reduce((sum, c) => sum + c.activeAppointments, 0);
  const totalCompleted = customers.reduce((sum, c) => sum + c.completedAppointments, 0);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Client & User Directory
            </h1>
            <span className="rounded-full bg-brand-100 text-brand-800 px-2.5 py-0.5 text-xs font-bold">
              Admin Tracking
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete operational visibility into all clients, hiring patterns, and service appointments
          </p>
        </div>

        <button
          type="button"
          onClick={fetchCustomers}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors shadow-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync Clients</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Total Registered Clients</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalClients}</div>
          <div className="text-[11px] text-brand-600 mt-0.5 font-medium">Active hirers</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Total Appointments Booked</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">{totalBookings}</div>
          <div className="text-[11px] text-indigo-600 mt-0.5 font-medium">All-time volume</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Active Bookings in Flight</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{totalActive}</div>
          <div className="text-[11px] text-amber-600 mt-0.5 font-medium">Scheduled & in progress</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Successfully Completed</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{totalCompleted}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5 font-medium">Resolved by specialists</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name, service zone, or skill requirement..."
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500"
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          {filteredCustomers.length} clients
        </span>
      </div>

      {/* Customers Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-brand-600" />
            <span>Loading clients database...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-600">
            <AlertCircle className="h-5 w-5 mx-auto mb-1" />
            {error}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Users className="h-10 w-10 mx-auto text-slate-300" />
            <div className="text-sm font-semibold text-slate-700">No matching clients found</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 font-bold uppercase tracking-wider text-[10px] text-slate-500">
                  <th className="py-3 px-4">Client / Customer</th>
                  <th className="py-3 px-4">Total Appointments</th>
                  <th className="py-3 px-4">Active Flights</th>
                  <th className="py-3 px-4">Completed</th>
                  <th className="py-3 px-4">Primary Zones</th>
                  <th className="py-3 px-4">Last Booking</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.name} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-xs">{customer.name}</div>
                      <div className="text-[10px] text-slate-400">
                        Skills: {customer.preferredSkills.slice(0, 3).join(', ') || 'General'}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {customer.totalAppointments}
                    </td>
                    <td className="py-3 px-4">
                      {customer.activeAppointments > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          {customer.activeAppointments} active
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-emerald-700">
                        {customer.completedAppointments}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {customer.serviceZones.map((z) => (
                          <span
                            key={z}
                            className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold text-slate-600"
                          >
                            {z}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {customer.lastBookingDate
                        ? new Date(customer.lastBookingDate).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(customer)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors shadow-2xs"
                      >
                        <Eye className="h-3 w-3" />
                        <span>History</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Booking History Drawer / Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-200 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-brand-400" />
                  Booking History: {selectedCustomer.name}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedCustomer.totalAppointments} total appointments • {selectedCustomer.activeAppointments} currently active
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {selectedCustomer.recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-400">
                      #{job.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        job.status === 'COMPLETED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : job.status === 'ASSIGNED' || job.status === 'IN_PROGRESS'
                          ? 'bg-brand-950 text-brand-300 border border-brand-500/40'
                          : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-white">{job.description}</h4>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {job.serviceZone}
                    </span>
                    <span>Priority: {job.priority}</span>
                    <span>
                      Created: {new Date(job.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {job.assignedTechnician ? (
                    <div className="mt-2 text-xs text-slate-300 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Assigned Specialist:</span>
                      <span className="font-semibold text-brand-300">
                        {job.assignedTechnician.name} ({job.assignedTechnician.phone || 'Dispatch'})
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] text-amber-400 italic">
                      Pending technician assignment in optimization queue
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersPage;
