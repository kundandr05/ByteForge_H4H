/**
 * DispatchGrid Offline Database
 * Persistent client-side IndexedDB storage for offline PWA operations.
 * Partitioned per authenticated user context with atomic operations and queue tracking.
 */

const DB_NAME = 'dispatchgrid_offline_v2';
const DB_VERSION = 2;

export interface QueuedOfflineAction {
  operationId: string;
  entityId: string;
  actionType: 'UPDATE_STATUS' | 'ADD_NOTE' | 'RECORD_ARRIVAL' | 'RECORD_REPAIR';
  payload: any;
  createdAt: string;
  userId: string;
  userRole: string;
  retryCount: number;
  status: 'PENDING' | 'SYNCING' | 'COMPLETED' | 'FAILED' | 'CONFLICT';
  idempotencyKey: string;
  error?: string;
  serverConflictData?: any;
}

export interface CachedWorkOrder {
  id: string;
  userId: string;
  customerName: string;
  description: string;
  priority: string;
  status: string;
  serviceZone?: string;
  requiredSkills?: string[];
  estimatedDuration?: number;
  latitude?: number;
  longitude?: number;
  updatedAt?: string;
  isCached?: boolean;
}

export interface CachedSchedule {
  id: string;
  userId: string;
  date: string;
  assignments: any[];
  unassignedCount: number;
  lastSyncedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported on this platform'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Schedules store
      if (!db.objectStoreNames.contains('schedules')) {
        const schedStore = db.createObjectStore('schedules', { keyPath: 'id' });
        schedStore.createIndex('userId', 'userId', { unique: false });
      }

      // 2. Work Orders store
      if (!db.objectStoreNames.contains('workOrders')) {
        const woStore = db.createObjectStore('workOrders', { keyPath: 'id' });
        woStore.createIndex('userId', 'userId', { unique: false });
        woStore.createIndex('status', 'status', { unique: false });
      }

      // 3. Technicians store
      if (!db.objectStoreNames.contains('technicians')) {
        db.createObjectStore('technicians', { keyPath: 'id' });
      }

      // 4. Assignments store
      if (!db.objectStoreNames.contains('assignments')) {
        const asgnStore = db.createObjectStore('assignments', { keyPath: 'id' });
        asgnStore.createIndex('technicianId', 'technicianId', { unique: false });
      }

      // 5. Offline Action Queue store
      if (!db.objectStoreNames.contains('actionQueue')) {
        const queueStore = db.createObjectStore('actionQueue', { keyPath: 'operationId' });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('userId', 'userId', { unique: false });
      }

      // 6. Meta key-value store (timestamps, versions)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

export const offlineDb = {
  /**
   * Save or update schedule state for offline access
   */
  async cacheSchedule(userId: string, date: string, assignments: any[], unassignedCount: number): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(['schedules', 'meta'], 'readwrite');
    const scheduleStore = tx.objectStore('schedules');
    const metaStore = tx.objectStore('meta');

    const scheduleId = `sched_${userId}_${date}`;
    const now = new Date().toISOString();

    scheduleStore.put({
      id: scheduleId,
      userId,
      date,
      assignments,
      unassignedCount,
      lastSyncedAt: now,
    });

    metaStore.put({
      key: `last_sync_${userId}`,
      timestamp: now,
    });

    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },

  /**
   * Retrieve cached schedule for user and date
   */
  async getCachedSchedule(userId: string, date: string): Promise<CachedSchedule | null> {
    const db = await getDb();
    return new Promise((res, rej) => {
      const tx = db.transaction('schedules', 'readonly');
      const store = tx.objectStore('schedules');
      const req = store.get(`sched_${userId}_${date}`);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  },

  /**
   * Cache list of work orders partitioned by user
   */
  async cacheWorkOrders(userId: string, jobs: any[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('workOrders', 'readwrite');
    const store = tx.objectStore('workOrders');

    for (const job of jobs) {
      store.put({
        ...job,
        userId,
        isCached: true,
      });
    }

    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },

  /**
   * Retrieve cached work orders for user
   */
  async getCachedWorkOrders(userId: string): Promise<CachedWorkOrder[]> {
    const db = await getDb();
    return new Promise((res, rej) => {
      const tx = db.transaction('workOrders', 'readonly');
      const store = tx.objectStore('workOrders');
      const index = store.index('userId');
      const req = index.getAll(userId);
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  },

  /**
   * Cache technicians list
   */
  async cacheTechnicians(techs: any[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('technicians', 'readwrite');
    const store = tx.objectStore('technicians');
    for (const t of techs) {
      store.put(t);
    }
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },

  /**
   * Get cached technicians
   */
  async getCachedTechnicians(): Promise<any[]> {
    const db = await getDb();
    return new Promise((res, rej) => {
      const tx = db.transaction('technicians', 'readonly');
      const store = tx.objectStore('technicians');
      const req = store.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  },

  /**
   * Get last synchronized timestamp for user
   */
  async getLastSyncTimestamp(userId: string): Promise<string | null> {
    const db = await getDb();
    return new Promise((res, rej) => {
      const tx = db.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const req = store.get(`last_sync_${userId}`);
      req.onsuccess = () => res(req.result?.timestamp || null);
      req.onerror = () => rej(req.error);
    });
  },

  /**
   * Enqueue an action when offline
   */
  async enqueueAction(action: Omit<QueuedOfflineAction, 'operationId' | 'createdAt' | 'retryCount' | 'status' | 'idempotencyKey'>): Promise<QueuedOfflineAction> {
    const db = await getDb();
    const operationId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const idempotencyKey = `idemp_${operationId}`;
    const queuedItem: QueuedOfflineAction = {
      ...action,
      operationId,
      idempotencyKey,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'PENDING',
    };

    return new Promise((res, rej) => {
      const tx = db.transaction('actionQueue', 'readwrite');
      const store = tx.objectStore('actionQueue');
      const req = store.put(queuedItem);
      req.onsuccess = () => res(queuedItem);
      req.onerror = () => rej(req.error);
    });
  },

  /**
   * Get all pending actions for user
   */
  async getPendingActions(userId?: string): Promise<QueuedOfflineAction[]> {
    const db = await getDb();
    return new Promise((res, rej) => {
      const tx = db.transaction('actionQueue', 'readonly');
      const store = tx.objectStore('actionQueue');
      const req = store.getAll();
      req.onsuccess = () => {
        const all: QueuedOfflineAction[] = req.result || [];
        const filtered = all.filter(
          (a) => (a.status === 'PENDING' || a.status === 'FAILED') && (!userId || a.userId === userId)
        );
        res(filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      };
      req.onerror = () => rej(req.error);
    });
  },

  /**
   * Update status of queued action
   */
  async updateActionStatus(
    operationId: string,
    status: QueuedOfflineAction['status'],
    error?: string,
    conflictData?: any
  ): Promise<void> {
    const db = await getDb();
    return new Promise((res, rej) => {
      const tx = db.transaction('actionQueue', 'readwrite');
      const store = tx.objectStore('actionQueue');
      const getReq = store.get(operationId);

      getReq.onsuccess = () => {
        if (!getReq.result) return res();
        const updated = {
          ...getReq.result,
          status,
          error: error || getReq.result.error,
          serverConflictData: conflictData || getReq.result.serverConflictData,
          retryCount: status === 'FAILED' ? (getReq.result.retryCount || 0) + 1 : getReq.result.retryCount,
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => res();
        putReq.onerror = () => rej(putReq.error);
      };

      getReq.onerror = () => rej(getReq.error);
    });
  },

  /**
   * Purge user specific cache on logout
   */
  async clearUserCache(userId: string): Promise<void> {
    try {
      const db = await getDb();
      const tx = db.transaction(['schedules', 'workOrders', 'meta'], 'readwrite');
      const woStore = tx.objectStore('workOrders');
      const woIndex = woStore.index('userId');
      const req = woIndex.getAllKeys(userId);
      req.onsuccess = () => {
        for (const key of req.result) {
          woStore.delete(key);
        }
      };
      tx.objectStore('meta').delete(`last_sync_${userId}`);
    } catch (err) {
      console.warn('Failed to clear user offline cache:', err);
    }
  },
};

