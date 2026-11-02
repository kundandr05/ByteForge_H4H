/**
 * DispatchGrid Offline Synchronization Manager
 * Orchestrates background sync, conflict detection, and queue execution.
 */

import { offlineDb, QueuedOfflineAction } from './offlineDb';
import { jobsApi } from '../services/dispatchApi';
import { apiClient } from '../services/api';

export type SyncState = 'IDLE' | 'SYNCING' | 'ERROR';

type SyncListener = (state: {
  isOnline: boolean;
  syncState: SyncState;
  pendingCount: number;
  lastSyncedAt: string | null;
}) => void;

class SyncManager {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private syncState: SyncState = 'IDLE';
  private listeners: Set<SyncListener> = new Set();
  private activeUserId: string | null = null;
  private syncInProgress: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notify();
        this.processQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });
    }
  }

  public setUserContext(userId: string | null) {
    this.activeUserId = userId;
    this.notify();
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    // Initial notification
    this.getPendingCount().then((count) => {
      this.getLastSync().then((lastSync) => {
        listener({
          isOnline: this.isOnline,
          syncState: this.syncState,
          pendingCount: count,
          lastSyncedAt: lastSync,
        });
      });
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notify() {
    const count = await this.getPendingCount();
    const lastSync = await this.getLastSync();
    this.listeners.forEach((listener) => {
      listener({
        isOnline: this.isOnline,
        syncState: this.syncState,
        pendingCount: count,
        lastSyncedAt: lastSync,
      });
    });
  }

  public getOnlineStatus(): boolean {
    return this.isOnline;
  }

  public async getPendingCount(): Promise<number> {
    try {
      const actions = await offlineDb.getPendingActions(this.activeUserId || undefined);
      return actions.length;
    } catch {
      return 0;
    }
  }

  public async getLastSync(): Promise<string | null> {
    if (!this.activeUserId) return null;
    return offlineDb.getLastSyncTimestamp(this.activeUserId);
  }

  /**
   * Safe offline execution: performs optimistic local update or queues action if offline
   */
  public async executeAction(action: {
    entityId: string;
    actionType: QueuedOfflineAction['actionType'];
    payload: any;
    userId: string;
    userRole: string;
  }): Promise<{ queued: boolean; operationId?: string; result?: any }> {
    if (!this.isOnline) {
      // Enqueue to persistent IndexedDB
      const queuedItem = await offlineDb.enqueueAction({
        entityId: action.entityId,
        actionType: action.actionType,
        payload: action.payload,
        userId: action.userId,
        userRole: action.userRole,
      });

      this.notify();
      return { queued: true, operationId: queuedItem.operationId };
    }

    // If online, perform directly
    try {
      const result = await this.performAction(action.entityId, action.actionType, action.payload);
      return { queued: false, result };
    } catch (err: any) {
      // If network fails during request, automatically fallback to offline queue
      if (err.statusCode === 503 || err.code === 'SERVICE_UNAVAILABLE' || err.code === 'NETWORK_ERROR') {
        const queuedItem = await offlineDb.enqueueAction({
          entityId: action.entityId,
          actionType: action.actionType,
          payload: action.payload,
          userId: action.userId,
          userRole: action.userRole,
        });
        this.notify();
        return { queued: true, operationId: queuedItem.operationId };
      }
      throw err;
    }
  }

  /**
   * Process all pending queued actions with conflict detection
   */
  public async processQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) return;

    this.syncInProgress = true;
    this.syncState = 'SYNCING';
    this.notify();

    try {
      const pendingActions = await offlineDb.getPendingActions(this.activeUserId || undefined);

      for (const action of pendingActions) {
        await offlineDb.updateActionStatus(action.operationId, 'SYNCING');

        try {
          // Conflict Detection: check if server record has been modified after action was queued
          if (action.actionType === 'UPDATE_STATUS' && action.entityId) {
            try {
              const serverJobRes = await jobsApi.get(action.entityId);
              const serverJob = serverJobRes.data;

              // If server job was updated after action creation and is cancelled/completed, detect conflict
              if (
                serverJob &&
                serverJob.updatedAt &&
                new Date(serverJob.updatedAt).getTime() > new Date(action.createdAt).getTime() &&
                serverJob.status !== action.payload?.status &&
                (serverJob.status === 'CANCELLED' || serverJob.status === 'COMPLETED')
              ) {
                console.warn(
                  `[OfflineSync] Conflict detected on job #${action.entityId}: server status is ${serverJob.status}, offline action target was ${action.payload?.status}`
                );
                await offlineDb.updateActionStatus(
                  action.operationId,
                  'CONFLICT',
                  `Conflict: Server record was updated to ${serverJob.status} by another user.`,
                  serverJob
                );
                continue; // Do not overwrite newer server state
              }
            } catch {
              // If get fails, continue with sync attempt
            }
          }

          // Execute operation with idempotency key
          await this.performAction(action.entityId, action.actionType, action.payload, action.idempotencyKey);
          await offlineDb.updateActionStatus(action.operationId, 'COMPLETED');
        } catch (err: any) {
          console.error(`[OfflineSync] Failed to sync action ${action.operationId}:`, err);
          await offlineDb.updateActionStatus(action.operationId, 'FAILED', err.message || 'Sync failed');
        }
      }

      this.syncState = 'IDLE';
    } catch (err) {
      console.error('[OfflineSync] Queue processing error:', err);
      this.syncState = 'ERROR';
    } finally {
      this.syncInProgress = false;
      this.notify();
    }
  }

  private async performAction(
    entityId: string,
    actionType: QueuedOfflineAction['actionType'],
    payload: any,
    idempotencyKey?: string
  ): Promise<any> {
    const options = idempotencyKey ? { idempotencyKey } : {};

    switch (actionType) {
      case 'UPDATE_STATUS':
        return apiClient(`/jobs/${entityId}/status`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
          ...options,
        });

      case 'ADD_NOTE':
        return apiClient(`/jobs/${entityId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
          ...options,
        });

      case 'RECORD_ARRIVAL':
        return apiClient(`/jobs/${entityId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'IN_PROGRESS', ...payload }),
          ...options,
        });

      case 'RECORD_REPAIR':
        return apiClient(`/jobs/${entityId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'COMPLETED', ...payload }),
          ...options,
        });

      default:
        throw new Error(`Unsupported offline action type: ${actionType}`);
    }
  }
}

export const syncManager = new SyncManager();

