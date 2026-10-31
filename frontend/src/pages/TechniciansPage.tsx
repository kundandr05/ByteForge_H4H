import React, { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Calendar,
  RefreshCw,
  AlertCircle,
  Trash2,
  UserX,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { techniciansApi } from '../services/dispatchApi';
import { Technician, TechnicianAvailabilityStatus } from '../types/dispatch';

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

export const TechniciansPage: React.FC = () => {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState('ALL');
  const [zoneFilter, setZoneFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [profileTech, setProfileTech] = useState<Technician | null>(null);
  const [editTech, setEditTech] = useState<Technician | null>(null);
  const [deleteTech, setDeleteTech] = useState<Technician | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Form
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    skills: ['ELECTRICAL'] as string[],
    serviceZones: ['ZONE_CENTRAL'] as string[],
    shiftStart: '08:00',
    shiftEnd: '17:00',
    latitude: 37.7749,
    longitude: -122.4194,
    availabilityStatus: 'AVAILABLE' as TechnicianAvailabilityStatus,
  });

  const fetchTechnicians = async () => {
    setLoading(true);
    try {
      const res = await techniciansApi.list({
        search: search || undefined,
        skill: skillFilter !== 'ALL' ? skillFilter : undefined,
        serviceZone: zoneFilter !== 'ALL' ? zoneFilter : undefined,
        availabilityStatus: statusFilter !== 'ALL' ? (statusFilter as TechnicianAvailabilityStatus) : undefined,
        limit: 100,
      });
      setTechnicians(res.data || []);
    } catch (err) {
      console.error('Failed to load technicians', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTechnicians();
  }, [skillFilter, zoneFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTechnicians();
  };

  const handleOpenCreateModal = () => {
    setFormData({
      name: '',
      email: '',
      phone: '+1-555-',
      skills: ['HVAC', 'ELECTRICAL'],
      serviceZones: ['ZONE_CENTRAL'],
      shiftStart: '08:00',
      shiftEnd: '17:00',
      latitude: 37.7749,
      longitude: -122.4194,
      availabilityStatus: 'AVAILABLE',
    });
    setFormError(null);
    setCreateModalOpen(true);
  };

  const handleOpenEditModal = (t: Technician) => {
    setEditTech(t);
    let parsedSkills: string[] = [];
    let parsedZones: string[] = [];
    try {
      parsedSkills = Array.isArray(t.skills) ? t.skills : JSON.parse(t.skills || '[]');
      parsedZones = Array.isArray(t.serviceZones) ? t.serviceZones : JSON.parse(t.serviceZones || '[]');
    } catch {
      parsedSkills = ['ELECTRICAL'];
      parsedZones = ['ZONE_CENTRAL'];
    }

    setFormData({
      name: t.name,
      email: t.email,
      phone: t.phone,
      skills: parsedSkills,
      serviceZones: parsedZones,
      shiftStart: t.shiftStart,
      shiftEnd: t.shiftEnd,
      latitude: t.latitude,
      longitude: t.longitude,
      availabilityStatus: t.availabilityStatus,
    });
    setFormError(null);
  };

  const handleCreateTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setFormError(null);
    try {
      await techniciansApi.create(formData);
      setCreateModalOpen(false);
      fetchTechnicians();
    } catch (err: any) {
      setFormError(err.message || 'Failed to register technician');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTech) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await techniciansApi.update(editTech.id, formData);
      setEditTech(null);
      fetchTechnicians();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update technician profile');
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuickAvailabilityToggle = async (tech: Technician) => {
    const nextStatus: Record<TechnicianAvailabilityStatus, TechnicianAvailabilityStatus> = {
      AVAILABLE: 'ON_SHIFT',
      ON_SHIFT: 'OFF_DUTY',
      OFF_DUTY: 'AVAILABLE',
      UNAVAILABLE: 'AVAILABLE',
    };
    const target = nextStatus[tech.availabilityStatus];
    try {
      setPageError(null);
      await techniciansApi.updateAvailability(tech.id, target);
      fetchTechnicians();
    } catch (err: any) {
      setPageError(err.message || 'Failed to update technician availability status');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTech) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await techniciansApi.delete(deleteTech.id, true);
      setDeleteTech(null);
      fetchTechnicians();
    } catch (err: any) {
      setFormError(err.message || 'Failed to remove technician from workforce');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setFormData((prev) => {
      const exists = prev.skills.includes(skill);
      return {
        ...prev,
        skills: exists ? prev.skills.filter((s) => s !== skill) : [...prev.skills, skill],
      };
    });
  };

  const toggleZone = (zone: string) => {
    setFormData((prev) => {
      const exists = prev.serviceZones.includes(zone);
      return {
        ...prev,
        serviceZones: exists ? prev.serviceZones.filter((z) => z !== zone) : [...prev.serviceZones, zone],
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Frontline Workforce Roster</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage certified technicians, authorized service zones, shift parameters, and availability states.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={fetchTechnicians} className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenCreateModal} className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span>Add Specialist</span>
          </Button>
        </div>
      </div>

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
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search technician name, email or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none"
            >
              <option value="ALL">All Skills</option>
              {ALL_SKILLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none"
            >
              <option value="ALL">All Service Zones</option>
              {SERVICE_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none"
            >
              <option value="ALL">All Availability</option>
              <option value="AVAILABLE">Available</option>
              <option value="ON_SHIFT">On Shift</option>
              <option value="UNAVAILABLE">Unavailable</option>
              <option value="OFF_DUTY">Off Duty</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Technicians Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Technician</th>
                <th className="px-4 py-3">Shift (UTC)</th>
                <th className="px-4 py-3">Certified Skills</th>
                <th className="px-4 py-3">Authorized Zones</th>
                <th className="px-4 py-3">Active Appointments</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                      <span>Loading workforce data...</span>
                    </div>
                  </td>
                </tr>
              ) : technicians.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No matching technicians found.
                  </td>
                </tr>
              ) : (
                technicians.map((t) => {
                  let skills: string[] = [];
                  let zones: string[] = [];
                  try {
                    skills = Array.isArray(t.skills) ? t.skills : JSON.parse(t.skills || '[]');
                    zones = Array.isArray(t.serviceZones) ? t.serviceZones : JSON.parse(t.serviceZones || '[]');
                  } catch {
                    skills = [];
                    zones = [];
                  }

                  const activeCount = t.assignments?.length || 0;

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div className="font-semibold text-slate-800">{t.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{t.email}</span>
                          <span>•</span>
                          <span>{t.phone}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 font-mono text-[11px]">
                        {t.shiftStart} - {t.shiftEnd}
                      </td>

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

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {zones.map((z, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[9px] font-medium"
                            >
                              {z}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-800">{activeCount} jobs</span>
                        <span className="text-[10px] text-slate-400 block">
                          {activeCount * 60}m shift booked
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => handleQuickAvailabilityToggle(t)}
                          className="focus:outline-none"
                          title="Click to cycle availability status"
                        >
                          <StatusBadge status={t.availabilityStatus} size="sm" />
                        </button>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setProfileTech(t)}
                            className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                            title="View Profile & Unavailability"
                          >
                            <Calendar className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(t)}
                            className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                            title="Edit Profile"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setFormError(null);
                              setDeleteTech(t);
                            }}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition"
                            title="Remove Specialist from Workforce"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Technician Profile Modal */}
      {profileTech && (
        <Modal
          isOpen={!!profileTech}
          onClose={() => setProfileTech(null)}
          title={`Technician Profile: ${profileTech.name}`}
          subtitle={`Roster ID: ${profileTech.id}`}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                <StatusBadge status={profileTech.availabilityStatus} size="sm" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Working Shift</span>
                <span className="font-mono font-medium text-slate-800">
                  {profileTech.shiftStart} - {profileTech.shiftEnd} UTC
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Email</span>
                <span className="text-slate-700 truncate block">{profileTech.email}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone</span>
                <span className="text-slate-700">{profileTech.phone}</span>
              </div>
            </div>

            <div>
              <h5 className="font-semibold text-slate-800 mb-1.5">Skill Certifications & Authorizations</h5>
              <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-slate-200 bg-white">
                {(Array.isArray(profileTech.skills) ? profileTech.skills : JSON.parse(profileTech.skills || '[]')).map(
                  (s: string) => (
                    <span key={s} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-semibold">
                      ✓ {s}
                    </span>
                  )
                )}
              </div>
            </div>

            <div>
              <h5 className="font-semibold text-slate-800 mb-1.5">Active Service Zones</h5>
              <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-slate-200 bg-white">
                {(Array.isArray(profileTech.serviceZones)
                  ? profileTech.serviceZones
                  : JSON.parse(profileTech.serviceZones || '[]')
                ).map((z: string) => (
                  <span key={z} className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-xs font-semibold">
                    📍 {z}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setProfileTech(null)}>
                Close Profile
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add / Edit Technician Modal */}
      <Modal
        isOpen={createModalOpen || !!editTech}
        onClose={() => {
          setCreateModalOpen(false);
          setEditTech(null);
        }}
        title={editTech ? `Edit Specialist: ${editTech.name}` : 'Register New Specialist'}
        subtitle="Configure skills, service zones, coordinates and shift windows"
        maxWidth="2xl"
      >
        <form onSubmit={editTech ? handleUpdateTechnician : handleCreateTechnician} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Marcus Vance"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="marcus.vance@dispatchgrid.io"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="+1-555-0102"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Shift Start (UTC)</label>
              <input
                type="text"
                required
                value={formData.shiftStart}
                onChange={(e) => setFormData({ ...formData, shiftStart: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                placeholder="08:00"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Shift End (UTC)</label>
              <input
                type="text"
                required
                value={formData.shiftEnd}
                onChange={(e) => setFormData({ ...formData, shiftEnd: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                placeholder="17:00"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Availability</label>
              <select
                value={formData.availabilityStatus}
                onChange={(e) =>
                  setFormData({ ...formData, availabilityStatus: e.target.value as TechnicianAvailabilityStatus })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="ON_SHIFT">ON_SHIFT</option>
                <option value="OFF_DUTY">OFF_DUTY</option>
                <option value="UNAVAILABLE">UNAVAILABLE</option>
              </select>
            </div>
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Base Latitude</label>
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
              <label className="block font-semibold text-slate-700 mb-1">Base Longitude</label>
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

          {/* Certified Skills */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Certified Labor Skills ({formData.skills.length} selected)
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-lg border border-slate-200 bg-slate-50">
              {ALL_SKILLS.map((skill) => {
                const selected = formData.skills.includes(skill);
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

          {/* Service Zones */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Authorized Service Zones ({formData.serviceZones.length} selected)
            </label>
            <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-slate-200 bg-slate-50">
              {SERVICE_ZONES.map((zone) => {
                const selected = formData.serviceZones.includes(zone);
                return (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => toggleZone(zone)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition ${
                      selected
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {zone}
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
                setEditTech(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={actionLoading}>
              {editTech ? 'Save Profile' : 'Register Specialist'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete / Offboard Specialist Modal */}
      {deleteTech && (
        <Modal
          isOpen={!!deleteTech}
          onClose={() => setDeleteTech(null)}
          title="Remove Specialist from Workforce"
          subtitle={`Technician: ${deleteTech.name} (${deleteTech.id.slice(0, 8)})`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-800 flex items-start gap-2.5">
              <UserX className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block text-rose-900">
                  Are you sure you want to offboard {deleteTech.name}?
                </span>
                <p className="text-[11px] leading-relaxed">
                  This action will permanently remove the technician from active dispatch rosters.
                  Any active scheduled jobs will be safely returned to the <span className="font-bold">PENDING pool</span> so no customer appointment is lost.
                </p>
              </div>
            </div>

            {formError && (
              <div className="rounded-lg bg-rose-100 border border-rose-300 p-2 text-rose-800 text-[11px]">
                {formError}
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700 space-y-1">
              <div><strong>Email:</strong> {deleteTech.email}</div>
              <div><strong>Phone:</strong> {deleteTech.phone}</div>
              <div><strong>Shift:</strong> {deleteTech.shiftStart} - {deleteTech.shiftEnd} UTC</div>
              <div>
                <strong>Active Assignments:</strong> {deleteTech.assignments?.length || 0} job(s)
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTech(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                isLoading={actionLoading}
                onClick={handleConfirmDelete}
              >
                Deactivate & Remove Specialist
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default TechniciansPage;
