import React from 'react';
import { Wifi, WifiOff, RefreshCw, Radio } from 'lucide-react';
import { StreamConnectionStatus } from '../../hooks/useDispatchStream';
import { SyncState } from '../../utils/syncManager';

interface RealtimeStatusBadgeProps {
  streamStatus: StreamConnectionStatus;
  isOnline: boolean;
  syncState?: SyncState;
  pendingCount?: number;
  lastSyncedAt?: string | null;
  onSyncNow?: () => void;
  className?: string;
}

export const RealtimeStatusBadge: React.FC<RealtimeStatusBadgeProps> = ({
  streamStatus,
  isOnline,
  syncState = 'IDLE',
  pendingCount = 0,
  lastSyncedAt,
  onSyncNow,
  className = '',
}) => {
  if (!isOnline) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 ${className}`}
        title={lastSyncedAt ? `Offline mode. Last synced at ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Offline mode'}
      >
        <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
        <span>Offline Mode</span>
        {pendingCount > 0 && (
          <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-slate-950 rounded-full font-bold text-[10px]">
            {pendingCount} queued
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Pending sync queue indicator */}
      {pendingCount > 0 && (
        <button
          onClick={onSyncNow}
          disabled={syncState === 'SYNCING'}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
          title="Click to synchronize queued offline actions immediately"
        >
          <RefreshCw className={`w-3 h-3 ${syncState === 'SYNCING' ? 'animate-spin text-blue-400' : ''}`} />
          <span>{pendingCount} to sync</span>
        </button>
      )}

      {/* SSE Connection Status */}
      {streamStatus === 'CONNECTED' ? (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          title="Live Server-Sent Events stream active. Real-time instant updates enabled."
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span>Live SSE</span>
        </div>
      ) : streamStatus === 'RECONNECTING' ? (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30"
          title="Reconnecting to real-time event stream..."
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
          <span>Reconnecting...</span>
        </div>
      ) : (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30"
          title="Stream disconnected. Operating on REST reconciliation."
        >
          <Wifi className="w-3.5 h-3.5 text-slate-400" />
          <span>Standby</span>
        </div>
      )}
    </div>
  );
};

