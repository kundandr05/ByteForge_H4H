import { EventEmitter } from 'events';

export type DispatchEventType =
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'DISPATCH_STARTED'
  | 'TECHNICIAN_ASSIGNED'
  | 'TECHNICIAN_ACCEPTED'
  | 'TECHNICIAN_REJECTED'
  | 'JOB_REASSIGNED'
  | 'TECHNICIAN_ARRIVED'
  | 'REPAIR_STARTED'
  | 'JOB_COMPLETED'
  | 'SCHEDULE_UPDATED'
  | 'CONNECTED'
  | 'HEARTBEAT';

export interface DispatchEventMessage {
  id: string;
  type: DispatchEventType;
  timestamp: string;
  entityId?: string;
  version?: number;
  payload?: any;
  targetTechnicianId?: string;
  targetCustomerName?: string;
}

class DispatchEventManager extends EventEmitter {
  private eventHistory: DispatchEventMessage[] = [];
  private readonly maxHistory = 100;
  private sequence = 0;

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  /**
   * Publishes an operational event to all active streams and records in ring buffer
   */
  public publish(
    type: DispatchEventType,
    options: {
      entityId?: string;
      payload?: any;
      version?: number;
      targetTechnicianId?: string;
      targetCustomerName?: string;
    } = {}
  ): DispatchEventMessage {
    this.sequence += 1;
    const event: DispatchEventMessage = {
      id: `evt_${Date.now()}_${this.sequence}`,
      type,
      timestamp: new Date().toISOString(),
      entityId: options.entityId,
      version: options.version || this.sequence,
      payload: options.payload || {},
      targetTechnicianId: options.targetTechnicianId,
      targetCustomerName: options.targetCustomerName,
    };

    // Maintain in-memory replay buffer
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    this.emit('dispatch_event', event);
    return event;
  }

  /**
   * Retrieves all missed events since lastEventId for seamless reconnection
   */
  public getEventsSince(lastEventId: string): DispatchEventMessage[] {
    const idx = this.eventHistory.findIndex((e) => e.id === lastEventId);
    if (idx === -1) {
      return [];
    }
    return this.eventHistory.slice(idx + 1);
  }
}

export const dispatchEvents = new DispatchEventManager();

// Backwards-compatible broadcast helper
export function broadcastDispatchUpdate(
  type: string,
  payload?: any,
  options?: {
    entityId?: string;
    targetTechnicianId?: string;
    targetCustomerName?: string;
  }
) {
  dispatchEvents.publish(type as DispatchEventType, {
    payload,
    entityId: options?.entityId || payload?.jobId || payload?.id,
    targetTechnicianId: options?.targetTechnicianId || payload?.technicianId,
    targetCustomerName: options?.targetCustomerName || payload?.customerName,
  });
}
