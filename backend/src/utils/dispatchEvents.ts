import { EventEmitter } from 'events';

class DispatchEventEmitter extends EventEmitter {}

export const dispatchEvents = new DispatchEventEmitter();
dispatchEvents.setMaxListeners(100);

export function broadcastDispatchUpdate(type: string, payload?: any) {
  dispatchEvents.emit('dispatch_update', {
    type,
    payload,
    timestamp: new Date().toISOString(),
  });
}

