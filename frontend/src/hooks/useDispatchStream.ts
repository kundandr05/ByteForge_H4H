import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/api';

export type StreamConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export interface DispatchStreamEvent {
  id: string;
  type: string;
  timestamp: string;
  entityId?: string;
  version?: number;
  payload?: any;
  targetTechnicianId?: string;
  targetCustomerName?: string;
}

export interface UseDispatchStreamOptions {
  onEvent?: (event: DispatchStreamEvent) => void;
  filterTypes?: string[];
  enabled?: boolean;
}

const MAX_SEEN_EVENTS = 300;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 16000;

export function useDispatchStream(options: UseDispatchStreamOptions = {}) {
  const { onEvent, filterTypes, enabled = true } = options;
  const { user } = useAuth();
  const [status, setStatus] = useState<StreamConnectionStatus>('DISCONNECTED');
  const [lastEvent, setLastEvent] = useState<DispatchStreamEvent | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const retryDelayRef = useRef<number>(INITIAL_RETRY_DELAY_MS);
  const lastEventIdRef = useRef<string | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const onEventRef = useRef(onEvent);
  const isMountedRef = useRef(true);

  // Keep callback ref fresh without triggering reconnect loops
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (isMountedRef.current) {
      setStatus('DISCONNECTED');
    }
  }, []);

  const connect = useCallback(async () => {
    if (!enabled || !user) return;

    // Clean up existing instance before new connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (isMountedRef.current) {
      setStatus('RECONNECTING');
    }

    try {
      // 1. Authenticate via secure ticket handshake
      const authRes = await apiClient<{ success: boolean; ticket: string }>('/dispatch/stream/auth', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          role: user.role,
          technicianId: user.technicianId || user.id,
          customerName: user.name,
        }),
      });

      if (!isMountedRef.current) return;

      if (!authRes || !authRes.ticket) {
        throw new Error('Failed to acquire stream ticket');
      }

      // 2. Open EventSource with ticket and safe Last-Event-ID replay
      const queryParams = new URLSearchParams({ ticket: authRes.ticket });
      if (lastEventIdRef.current) {
        queryParams.set('lastEventId', lastEventIdRef.current);
      }

      const streamUrl = `/api/dispatch/stream?${queryParams.toString()}`;
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (isMountedRef.current) {
          setStatus('CONNECTED');
          retryDelayRef.current = INITIAL_RETRY_DELAY_MS; // Reset backoff on healthy connection
        }
      };

      es.onmessage = (messageEvent) => {
        if (!isMountedRef.current) return;

        try {
          const rawData = JSON.parse(messageEvent.data) as DispatchStreamEvent;

          // Heartbeat handling
          if (rawData.type === 'HEARTBEAT') {
            return;
          }

          // Initial connection acknowledgement
          if (rawData.type === 'CONNECTED') {
            setStatus('CONNECTED');
            return;
          }

          // Deduplication: prevent double execution for previously processed event IDs
          if (rawData.id) {
            if (seenEventIdsRef.current.has(rawData.id)) {
              return;
            }
            seenEventIdsRef.current.add(rawData.id);
            if (seenEventIdsRef.current.size > MAX_SEEN_EVENTS) {
              const first = seenEventIdsRef.current.values().next().value;
              if (first) seenEventIdsRef.current.delete(first);
            }
            lastEventIdRef.current = rawData.id;
          }

          // Filter by event types if requested
          if (filterTypes && filterTypes.length > 0 && !filterTypes.includes(rawData.type)) {
            return;
          }

          setLastEvent(rawData);
          if (onEventRef.current) {
            onEventRef.current(rawData);
          }
        } catch (err) {
          console.warn('[SSE] Failed to parse message frame:', err);
        }
      };

      es.onerror = () => {
        if (!isMountedRef.current) return;

        es.close();
        eventSourceRef.current = null;
        setStatus('RECONNECTING');

        // Exponential backoff
        const nextDelay = retryDelayRef.current;
        retryDelayRef.current = Math.min(retryDelayRef.current * 1.8, MAX_RETRY_DELAY_MS);

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, nextDelay);
      };
    } catch (err) {
      if (!isMountedRef.current) return;

      setStatus('RECONNECTING');
      const nextDelay = retryDelayRef.current;
      retryDelayRef.current = Math.min(retryDelayRef.current * 1.8, MAX_RETRY_DELAY_MS);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connect();
        }
      }, nextDelay);
    }
  }, [enabled, user, filterTypes]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  const reconnect = useCallback(() => {
    retryDelayRef.current = INITIAL_RETRY_DELAY_MS;
    disconnect();
    connect();
  }, [connect, disconnect]);

  return {
    status,
    lastEvent,
    reconnect,
  };
}
