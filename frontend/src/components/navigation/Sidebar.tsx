import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Users2,
  CalendarDays,
  Zap,
  Flame,
  History,
  FileText,
  Settings,
  Grid,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Users,
  Wrench,
  User,
  ShieldCheck,
  LogIn,
  Wind,
  Refrigerator,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useHealth } from '../../hooks/useHealth';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { data: health } = useHealth(10000);
  const { user, role } = useAuth();

  // Navigation items for Admin/Dispatcher
  const adminNavItems = [
    {
      name: 'Overview',
      href: '/',
      icon: LayoutDashboard,
      badge: 'Live',
    },
    {
      name: 'Clients Directory',
      href: '/customers',
      icon: Users,
      badge: 'Tracking',
    },
    {
      name: 'Jobs',
      href: '/jobs',
      icon: Briefcase,
    },
    {
      name: 'Technicians',
      href: '/technicians',
      icon: Users2,
    },
    {
      name: 'Scheduling Board',
      href: '/scheduling',
      icon: CalendarDays,
      badge: 'Gantt',
    },
    {
      name: 'Optimization Center',
      href: '/optimization',
      icon: Zap,
    },
    {
      name: 'Disruption Simulator',
      href: '/disruptions',
      icon: Flame,
      badge: 'AI',
    },
    {
      name: 'Recovery History',
      href: '/recovery',
      icon: History,
    },
    {
      name: 'Audit Logs',
      href: '/audit',
      icon: FileText,
    },
    {
      name: 'Settings & Health',
      href: '/settings',
      icon: Settings,
    },
  ];

  // Consumer-focused navigation items for Client / End User (NO admin console or system health!)
  const userNavItems = [
    {
      name: 'All Services',
      href: '/user-dashboard',
      icon: LayoutDashboard,
      badge: 'Explore',
    },
    {
      name: 'AC Service & Repair',
      href: '/user-dashboard?category=ac',
      icon: Wind,
      badge: '★ 4.9',
    },
    {
      name: 'Fridge & Appliance',
      href: '/user-dashboard?category=appliance',
      icon: Refrigerator,
      badge: 'Popular',
    },
    {
      name: 'Electrician & Plumber',
      href: '/user-dashboard?category=electrical',
      icon: Wrench,
    },
    {
      name: 'My Bookings',
      href: '/user-dashboard?tab=bookings',
      icon: CalendarDays,
      badge: 'Track',
    },
  ];

  // Specialist-focused navigation items for Field Technician (NO admin console or system health!)
  const technicianNavItems = [
    {
      name: 'My Schedule & Tasks',
      href: '/technician-dashboard?tab=schedule',
      icon: Wrench,
      badge: 'Active',
    },
    {
      name: 'Live Job Offers',
      href: '/technician-dashboard?tab=offers',
      icon: Zap,
      badge: 'Live',
    },
    {
      name: 'Company Discover',
      href: '/technician-dashboard?tab=discover',
      icon: Sparkles,
      badge: 'Offers',
    },
    {
      name: 'Earnings & Hours',
      href: '/technician-dashboard?tab=earnings',
      icon: Briefcase,
      badge: 'USD',
    },
    {
      name: 'Skills & Profile',
      href: '/technician-dashboard?tab=profile',
      icon: User,
    },
  ];

  const activeNavItems =
    role === 'user'
      ? userNavItems
      : role === 'technician'
      ? technicianNavItems
      : adminNavItems;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar container - Dark Navy look */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 border-r border-slate-800 text-slate-300 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-6 bg-slate-950/60">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white shadow-md shadow-brand-500/20">
            <Grid className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-white text-base">DispatchGrid</span>
              <span className="rounded bg-brand-900/80 border border-brand-500/30 px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider text-brand-300">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {role === 'user' ? 'Customer Services' : 'Workforce & Recovery'}
            </p>
          </div>
        </div>

        {/* Current Active Persona Banner */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider">
              Active Persona:
            </span>
            <Link
              to="/login"
              onClick={onClose}
              className="text-[10px] text-brand-400 hover:text-brand-300 font-bold flex items-center gap-1 hover:underline"
            >
              <LogIn className="h-3 w-3" /> Switch
            </Link>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md text-white text-xs font-bold shadow-xs',
                role === 'admin'
                  ? 'bg-brand-600'
                  : role === 'technician'
                  ? 'bg-emerald-600'
                  : 'bg-indigo-600'
              )}
            >
              {role === 'admin' ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : role === 'technician' ? (
                <Wrench className="h-3.5 w-3.5" />
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-white truncate">{user.name}</div>
              <div className="text-[10px] text-slate-400 capitalize">
                {role === 'user' ? 'Verified Client' : `${role} Account`}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {role === 'user' ? 'Service Categories' : role === 'admin' ? 'Operations Platform' : 'Specialist Console'}
          </div>
          <nav className="space-y-1">
            {activeNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === '/' || item.href === '/technician-dashboard'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all',
                      isActive
                        ? 'bg-brand-600 text-white font-semibold shadow-sm shadow-brand-600/30'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={cn(
                            'h-4 w-4 transition-colors',
                            isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                          )}
                        />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.2 text-[9px] font-bold tracking-wide uppercase',
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer Area: Technical health for Admin, or Customer Assistant Card for Users */}
        <div className="border-t border-slate-800/80 p-3 bg-slate-950/40">
          {role === 'admin' ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                  <Activity className="h-3.5 w-3.5 text-brand-400" />
                  Backend Engine
                </span>
                {health?.status === 'ok' ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Live (Port 5000)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Connecting...
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 flex justify-between">
                <span>SQLite: {health?.database?.connected ? 'Online' : 'Ready'}</span>
                <span>Uptime: {health?.uptimeSeconds || 0}s</span>
              </div>
            </div>
          ) : role === 'technician' ? (
            <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/40 p-2.5 text-xs">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Field Dispatch Ready
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Automated nearest-neighbor dispatch active. Toggle online to receive live appointment calls.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-indigo-900/40 bg-indigo-950/40 p-2.5 text-xs">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                AI Voice Booking
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Click the mic/chat icon at the bottom right to schedule any repair using voice or text.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
