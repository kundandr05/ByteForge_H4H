import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  User,
  Wrench,
  Grid,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  PlusCircle,
  AlertCircle,
} from 'lucide-react';
import { useAuth, UserRole } from '../context/AuthContext';
import { techniciansApi } from '../services/dispatchApi';
import { Technician } from '../types/dispatch';
import { ensureArray } from '../utils/formatters';

const AVAILABLE_SKILLS = [
  'HVAC',
  'ELECTRICAL',
  'PLUMBING',
  'APPLIANCE',
  'ROOFING',
  'SMART_HOME',
  'SECURITY',
  'EV_CHARGER',
];

const AVAILABLE_ZONES = [
  'ZONE_NORTH',
  'ZONE_SOUTH',
  'ZONE_EAST',
  'ZONE_WEST',
  'ZONE_CENTRAL',
];

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<UserRole>('user');

  // Client form state
  const [clientName, setClientName] = useState('Sarah Jenkins');
  const [clientEmail, setClientEmail] = useState('sarah.jenkins@example.com');

  // Technician state
  const [existingTechs, setExistingTechs] = useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [isFirstTimeTech, setIsFirstTimeTech] = useState(false);
  const [loadingTechs, setLoadingTechs] = useState(false);

  // First-time technician onboarding form
  const [techName, setTechName] = useState('');
  const [techEmail, setTechEmail] = useState('');
  const [techPhone, setTechPhone] = useState('+1 (555) 749-3382');
  const [selectedSkills, setSelectedSkills] = useState<string[]>(['HVAC', 'ELECTRICAL']);
  const [selectedZones, setSelectedZones] = useState<string[]>(['ZONE_NORTH', 'ZONE_EAST']);
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [techError, setTechError] = useState<string | null>(null);
  const [techSubmitting, setTechSubmitting] = useState(false);

  // Load existing technicians from database
  useEffect(() => {
    const fetchTechs = async () => {
      setLoadingTechs(true);
      try {
        const res = await techniciansApi.list({ limit: 50 });
        setExistingTechs(res.data);
        if (res.data.length > 0) {
          setSelectedTechId(res.data[0].id);
        }
      } catch (err) {
        console.warn('Failed to load technicians list:', err);
      } finally {
        setLoadingTechs(false);
      }
    };

    fetchTechs();
  }, []);

  // Handle Client Sign In
  const handleClientLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    login({
      id: `client-${Date.now()}`,
      name: clientName.trim() || 'Valued Client',
      email: clientEmail.trim() || 'client@example.com',
      role: 'user',
      phone: '+1 (555) 234-5678',
    });
    navigate('/user-dashboard');
  };

  // Handle Existing Technician Sign In
  const handleExistingTechLogin = () => {
    const found = existingTechs.find((t) => t.id === selectedTechId);
    if (!found) return;

    const skills = Array.isArray(found.skills)
      ? found.skills
      : typeof found.skills === 'string'
      ? JSON.parse(found.skills || '[]')
      : [];
    const serviceZones = Array.isArray(found.serviceZones)
      ? found.serviceZones
      : typeof found.serviceZones === 'string'
      ? JSON.parse(found.serviceZones || '[]')
      : [];

    login({
      id: found.id,
      technicianId: found.id,
      name: found.name,
      email: found.email,
      role: 'technician',
      phone: found.phone,
      skills,
      serviceZones,
    });
    navigate('/technician-dashboard');
  };

  // Handle First-Time Technician Onboarding Registration
  const handleFirstTimeTechSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTechError(null);

    if (!techName.trim() || !techEmail.trim()) {
      setTechError('Please enter your full name and valid email.');
      return;
    }

    if (selectedSkills.length === 0) {
      setTechError('Please select at least one area of expertise / skill.');
      return;
    }

    if (selectedZones.length === 0) {
      setTechError('Please select at least one service zone.');
      return;
    }

    setTechSubmitting(true);
    try {
      // Create new technician in SQLite backend database
      const createdRes = await techniciansApi.create({
        name: techName.trim(),
        email: techEmail.trim(),
        phone: techPhone.trim() || '+1 (555) 000-0000',
        skills: selectedSkills,
        serviceZones: selectedZones,
        latitude: 37.7749,
        longitude: -122.4194,
        shiftStart,
        shiftEnd,
        availabilityStatus: 'AVAILABLE',
      });

      const newTech = createdRes.data;
      const skills = Array.isArray(newTech.skills)
        ? newTech.skills
        : typeof newTech.skills === 'string'
        ? JSON.parse(newTech.skills || '[]')
        : [];
      const serviceZones = Array.isArray(newTech.serviceZones)
        ? newTech.serviceZones
        : typeof newTech.serviceZones === 'string'
        ? JSON.parse(newTech.serviceZones || '[]')
        : [];

      // Log in as new technician
      login({
        id: newTech.id,
        technicianId: newTech.id,
        name: newTech.name,
        email: newTech.email,
        role: 'technician',
        phone: newTech.phone,
        skills,
        serviceZones,
        isFirstTime: true,
      });

      navigate('/technician-dashboard');
    } catch (err: any) {
      setTechError(err.message || 'Failed to register technician. Check if email already exists.');
    } finally {
      setTechSubmitting(false);
    }
  };

  // Handle Admin Sign In
  const handleAdminLogin = () => {
    login({
      id: 'admin-1',
      name: 'Operations Dispatcher',
      email: 'dispatcher@dispatchgrid.internal',
      role: 'admin',
    });
    navigate('/');
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const toggleZone = (zone: string) => {
    setSelectedZones((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-lg shadow-brand-500/20 mb-3">
          <Grid className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          DispatchGrid Portal
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Autonomous Field Workforce & Dispatch Coordination Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg z-10 px-4 sm:px-0">
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-2xl text-slate-200">
          
          {/* Role Selection Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950/70 border border-slate-800 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('user')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'user'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>Client / User</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('technician')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'technician'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Technician</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'admin'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin</span>
            </button>
          </div>

          {/* 1. END USER (CLIENT) LOGIN */}
          {activeTab === 'user' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <User className="h-4 w-4 text-brand-400" />
                  Client & Customer Access
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hire field technicians, book appointments via AI voice/chat, and track arrival status.
                </p>
              </div>

              {/* Sample User Presets */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Quick Select Demo Client
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: 'Sarah Jenkins', email: 'sarah.jenkins@example.com' },
                    { name: 'Michael Chang', email: 'm.chang@apextech.com' },
                    { name: 'Emily Davis', email: 'emily.d@metropolis.org' },
                    { name: 'David Wilson', email: 'dwilson@bayproperties.com' },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setClientName(preset.name);
                        setClientEmail(preset.email);
                      }}
                      className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                        clientName === preset.name
                          ? 'border-brand-500 bg-brand-950/40 text-brand-200'
                          : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold text-white">{preset.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{preset.email}</div>
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleClientLogin} className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    placeholder="Enter your full name"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    required
                    placeholder="name@company.com"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-600/30 active:scale-98 transition-all"
                >
                  <span>Sign In as Client</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}

          {/* 2. TECHNICIAN LOGIN (WITH FIRST-TIME ONBOARDING FLOW) */}
          {activeTab === 'technician' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-brand-400" />
                    Field Specialist Access
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    View assigned shift schedule, update availability, and manage skills.
                  </p>
                </div>
              </div>

              {/* Toggle First-time vs Existing */}
              <div className="flex gap-2 p-1 bg-slate-950/60 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setIsFirstTimeTech(false)}
                  className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold transition-all ${
                    !isFirstTimeTech
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Existing Specialist
                </button>
                <button
                  type="button"
                  onClick={() => setIsFirstTimeTech(true)}
                  className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                    isFirstTimeTech
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <PlusCircle className="h-3 w-3" />
                  First-Time Specialist
                </button>
              </div>

              {!isFirstTimeTech ? (
                /* Existing Technician Selector */
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Select Technician Profile
                    </label>
                    {loadingTechs ? (
                      <div className="text-xs text-slate-400 py-2">Loading active specialists...</div>
                    ) : (
                      <select
                        value={selectedTechId}
                        onChange={(e) => setSelectedTechId(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
                      >
                        {existingTechs.map((tech) => (
                          <option key={tech.id} value={tech.id}>
                            {tech.name} • {ensureArray(tech.skills).join(', ')} ({ensureArray(tech.serviceZones).join(', ')})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {selectedTechId && (
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-1">
                      {(() => {
                        const t = existingTechs.find((tech) => tech.id === selectedTechId);
                        if (!t) return null;
                        return (
                          <>
                            <div className="font-semibold text-white">{t.name}</div>
                            <div className="text-slate-400 text-[11px]">{t.email} • {t.phone}</div>
                            <div className="flex flex-wrap gap-1 pt-1">
                              {((Array.isArray(t.skills)
                                ? t.skills
                                : typeof t.skills === 'string'
                                ? JSON.parse(t.skills || '[]')
                                : []) as string[]).map((s: string) => (
                                <span key={s} className="rounded bg-brand-950 border border-brand-500/30 px-1.5 py-0.2 text-[9px] font-bold text-brand-300">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleExistingTechLogin}
                    disabled={!selectedTechId}
                    className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-600/30 active:scale-98 transition-all"
                  >
                    <span>Sign In to Specialist Console</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                /* First-Time Technician Onboarding Form */
                <form onSubmit={handleFirstTimeTechSubmit} className="space-y-3">
                  <div className="rounded-lg bg-brand-950/50 border border-brand-500/30 p-2.5 text-[11px] text-brand-200 flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>First-time Onboarding:</strong> Enter your details and skills expertise. Your profile will be added to the workforce and updated on the Admin Dashboard immediately.
                    </span>
                  </div>

                  {techError && (
                    <div className="rounded-lg bg-rose-950/60 border border-rose-500/40 p-2 text-xs text-rose-300 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{techError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={techName}
                        onChange={(e) => setTechName(e.target.value)}
                        required
                        placeholder="e.g. David Miller"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={techEmail}
                        onChange={(e) => setTechEmail(e.target.value)}
                        required
                        placeholder="david.m@dispatch.internal"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={techPhone}
                      onChange={(e) => setTechPhone(e.target.value)}
                      placeholder="+1 (555) 749-3382"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                    />
                  </div>

                  {/* Skills / Area of Expertise */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Area of Expertise / Skills * ({selectedSkills.length} selected)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_SKILLS.map((skill) => {
                        const isSelected = selectedSkills.includes(skill);
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => toggleSkill(skill)}
                            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                              isSelected
                                ? 'bg-brand-600 text-white shadow-xs'
                                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {skill}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Service Zones */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Assigned Service Zones * ({selectedZones.length} selected)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_ZONES.map((zone) => {
                        const isSelected = selectedZones.includes(zone);
                        return (
                          <button
                            key={zone}
                            type="button"
                            onClick={() => toggleZone(zone)}
                            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {zone}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Shift Schedule */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">
                        Shift Start (UTC)
                      </label>
                      <input
                        type="time"
                        value={shiftStart}
                        onChange={(e) => setShiftStart(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">
                        Shift End (UTC)
                      </label>
                      <input
                        type="time"
                        value={shiftEnd}
                        onChange={(e) => setShiftEnd(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={techSubmitting}
                    className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 active:scale-98 transition-all"
                  >
                    <span>{techSubmitting ? 'Registering...' : 'Register & Enter Specialist Console'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          )}

          {/* 3. ADMIN LOGIN */}
          {activeTab === 'admin' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-400" />
                  Operations Dispatcher & Administrator
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete workforce control, track all clients and technicians, and manage or remove specialists.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Administrator Privileges Active
                </div>
                <ul className="text-slate-400 text-[11px] space-y-1 pl-6 list-disc">
                  <li>Full tracking of all end users, job requests, and appointment history</li>
                  <li>Real-time technician tracking, shift allocations, and active workload</li>
                  <li>One-click technician offboarding & safe job re-pooling</li>
                  <li>Autonomous optimization engine & AI disruption recovery</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={handleAdminLogin}
                className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-600/30 active:scale-98 transition-all"
              >
                <span>Enter Operations Control Room</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
