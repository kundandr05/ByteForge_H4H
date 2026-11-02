import { useEffect, useState, useCallback } from 'react';
import { syncManager, SyncState } from '../utils/syncManager';
import { useAuth } from '../context/AuthContext';
import { QueuedOfflineAction } from '../utils/offlineDb';

export function useOfflineSync() {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(syncManager.getOnlineStatus());
  const [syncState, setSyncState] = useState<SyncState>('IDLE');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    syncManager.setUserContext(user?.id || null);

    const unsubscribe = syncManager.subscribe((state) => {
      setIsOnline(state.isOnline);
      setSyncState(state.syncState);
      setPendingCount(state.pendingCount);
      setLastSyncedAt(state.lastSyncedAt);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  const syncNow = useCallback(() => {
    syncManager.processQueue();
  }, []);

  const executeAction = useCallback(
    async (
      entityId: string,
      actionType: QueuedOfflineAction['actionType'],
      payload: any
    ) => {
      if (!user) throw new Error('User not authenticated');
      return syncManager.executeAction({
        entityId,
        actionType,
        payload,
        userId: user.id,
        userRole: user.role,
      });
    },
    [user]
  );

  return {
    isOnline,
    syncState,
    pendingCount,
    lastSyncedAt,
    syncNow,
    executeAction,
  };
}
