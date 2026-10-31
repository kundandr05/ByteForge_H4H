import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, RefreshCw, Cpu, User, Wrench, ShieldCheck, LogIn, Sparkles } from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { useHealth } from '../../hooks/useHealth';
import { useAuth } from '../../context/AuthContext';

interface TopNavbarProps {
  onToggleSidebar: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ onToggleSidebar }) => {
  const { data: health, loading, refetch } = useHealth();
  const { user, role } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Brand / Path Area */}
        <div className="flex items-center gap-2">
          {role === 'user' ? (
            /* Clean consumer branding without technical internal workspace path */
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-tight text-slate-900 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-brand-600" />
                TaskMate Services
              </span>
              <span className="hidden sm:inline text-slate-300">•</span>
              <span className="hidden sm:inline text-xs font-medium text-slate-500">
                Home Repair & Appliance Booking
              </span>
            </div>
          ) : role === 'technician' ? (
            /* Clean specialist branding without technical internal workspace path */
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-tight text-slate-900 flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-emerald-600" />
                Specialist Console
              </span>
              <span className="hidden sm:inline text-slate-300">•</span>
              <span className="hidden sm:inline text-xs font-medium text-slate-500">
                Field Dispatch & Offers
              </span>
            </div>
          ) : (
            /* Admin operational breadcrumb */
            <>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Workspace
                </span>
                <span className="text-slate-300">/</span>
                <span className="text-sm font-medium text-slate-800">
                  DispatchGrid Operations
                </span>
              </div>
              <Badge variant="info" className="ml-1 text-[11px] capitalize">
                Admin View
              </Badge>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Technical API node badge ONLY visible to admin */}
        {role === 'admin' && (
          <>
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-100 text-xs text-slate-600">
              <Cpu className="h-3.5 w-3.5 text-slate-500" />
              <span>API Node {health?.system.nodeVersion || 'v25'}</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">Env: {health?.environment || 'development'}</span>
            </div>

            {/* Sync / Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              isLoading={loading}
              className="gap-1.5 text-xs text-slate-600"
              title="Refresh Backend Status"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </>
        )}

        {/* Switch Role / Login Quick Action Button */}
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
          title="Switch role between Client, Technician, and Admin"
        >
          <LogIn className="h-3.5 w-3.5 text-brand-600" />
          <span className="hidden sm:inline">Switch Role</span>
        </Link>

        {/* User profile avatar & role indicator */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${
              role === 'admin'
                ? 'bg-slate-800'
                : role === 'technician'
                ? 'bg-emerald-600'
                : 'bg-indigo-600'
            }`}
          >
            {role === 'admin' ? (
              <ShieldCheck className="h-4 w-4" />
            ) : role === 'technician' ? (
              <Wrench className="h-4 w-4" />
            ) : (
              <User className="h-4 w-4" />
            )}
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-semibold text-slate-800">{user.name}</div>
            <div className="text-[10px] text-slate-400 capitalize">
              {role === 'user' ? 'Verified Client' : role === 'technician' ? 'Field Specialist' : 'Operations Admin'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopNavbar;
