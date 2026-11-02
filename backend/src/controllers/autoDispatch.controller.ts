import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { autoDispatchService } from '../services/autoDispatch.service';
import { technicianService } from '../services/technician.service';
import { AppError } from '../utils/appError';
import { ApiResponse } from '../types';
import { dispatchEvents, DispatchEventMessage } from '../utils/dispatchEvents';

interface StreamClient {
  id: string;
  res: Response;
  role: string;
  technicianId?: string;
  customerName?: string;
  connectedAt: Date;
}

interface StreamTicket {
  role: string;
  technicianId?: string;
  customerName?: string;
  expiresAt: number;
}

const activeStreamClients = new Map<string, StreamClient>();
const streamTickets = new Map<string, StreamTicket>();

export class AutoDispatchController {
  /**
   * Admin starts automated allocation for a specific job.
   * Matches skills and sends the live offer to the nearest candidate.
   */
  public startAllocation = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      if (!jobId) {
        throw AppError.badRequest('Job ID is required to start automated allocation.');
      }

      const cascadeState = await autoDispatchService.startAllocation(jobId);

      res.status(200).json({
        success: true,
        message: `Automated allocation started. Offer dispatched to nearest specialist: ${cascadeState.currentOffer?.technicianName} (${cascadeState.currentOffer?.distanceKm} km away).`,
        data: cascadeState,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin initiates bulk auto-allocation for all pending unassigned jobs.
   */
  public autoAllocateAll = async (
    _req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await autoDispatchService.autoAllocateAllPending();

      res.status(200).json({
        success: true,
        message: `Automated allocation completed. Processed ${result.allocated.length} jobs.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Technician checks for incoming real-time dispatch offers.
   */
  public getActiveOffer = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { technicianId } = req.params;
      if (!technicianId) {
        throw AppError.badRequest('Technician ID is required.');
      }

      const offerResult = autoDispatchService.getActiveOfferForTechnician(technicianId);

      res.status(200).json({
        success: true,
        message: offerResult.offer ? 'Active incoming offer found.' : 'No pending offers.',
        data: offerResult,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Technician accepts the incoming dispatch offer.
   */
  public acceptOffer = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const { technicianId } = req.body;

      if (!jobId || !technicianId) {
        throw AppError.badRequest('Both jobId and technicianId are required to accept an offer.');
      }

      const result = await autoDispatchService.acceptOffer(jobId, technicianId);

      res.status(200).json({
        success: true,
        message: 'Job offer accepted and scheduled successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Technician declines the offer.
   * System cascades the offer to the second closest (next nearest) technician.
   */
  public rejectOffer = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const { technicianId, reason } = req.body;

      if (!jobId || !technicianId) {
        throw AppError.badRequest('Both jobId and technicianId are required to decline an offer.');
      }

      const result = await autoDispatchService.rejectOffer(jobId, technicianId, reason);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * View all active dispatch cascades (for Admin console / live board).
   */
  public getAllCascades = async (
    _req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const cascades = autoDispatchService.getAllCascades();

      res.status(200).json({
        success: true,
        message: 'Dispatch cascades retrieved successfully.',
        data: cascades,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * View specific cascade status.
   */
  public getCascadeById = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const cascade = autoDispatchService.getCascadeById(jobId);

      if (!cascade) {
        throw AppError.notFound(`No cascade found for job ${jobId}.`);
      }

      res.status(200).json({
        success: true,
        message: 'Cascade status retrieved.',
        data: cascade,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Technician earnings & hours worked summary.
   */
  public getEarnings = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const earnings = await autoDispatchService.getTechnicianEarnings(id);

      res.status(200).json({
        success: true,
        message: 'Technician earnings and working hours retrieved.',
        data: earnings,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Discover company offers and perks for technicians.
   */
  public getDiscoverOffers = async (
    _req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const discover = autoDispatchService.getDiscoverOffers();

      res.status(200).json({
        success: true,
        message: 'Company discover offers and perks retrieved.',
        data: discover,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Toggle technician online/offline availability status.
   */
  public updateOnlineStatus = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { isOnline } = req.body;

      if (typeof isOnline !== 'boolean') {
        throw AppError.badRequest('isOnline must be a boolean (true for online, false for offline).');
      }

      const targetStatus = isOnline ? 'AVAILABLE' : 'OFF_DUTY';
      const updated = await technicianService.updateAvailability(id, targetStatus as any);

      res.status(200).json({
        success: true,
        message: `Specialist status changed to ${isOnline ? 'Online (Accepting Dispatches)' : 'Offline (Shift Inactive)'}.`,
        data: {
          technician: updated,
          isOnline,
          availabilityStatus: updated.availabilityStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin triggers automatic scheduling of all unassigned jobs to nearest specialists.
   */
  public autoScheduleAll = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { referenceDate } = req.body;
      const result = await autoDispatchService.autoScheduleAllUnassigned({ referenceDate });

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Simulates technician response (ACCEPT or REJECT) for interactive hackathon demonstration.
   */
  public simulateResponse = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const { action, reason } = req.body;

      if (!action || (action !== 'ACCEPT' && action !== 'REJECT')) {
        throw AppError.badRequest("Action must be either 'ACCEPT' or 'REJECT'.");
      }

      const result = await autoDispatchService.simulateTechnicianResponse(jobId, action, reason);

      res.status(200).json({
        success: true,
        message: action === 'ACCEPT' ? 'Simulated acceptance: Job scheduled and assigned.' : result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Generates a short-lived ticket for secure EventSource stream authentication
   * without exposing permanent credentials or tokens in browser URLs.
   */
  public generateStreamTicket = (req: Request, res: Response): void => {
    const { role = 'admin', technicianId, customerName } = req.body;
    const ticketId = randomUUID();
    streamTickets.set(ticketId, {
      role,
      technicianId,
      customerName,
      expiresAt: Date.now() + 60000, // 60-second validity
    });

    // Cleanup expired tickets
    const now = Date.now();
    for (const [key, t] of streamTickets.entries()) {
      if (t.expiresAt < now) {
        streamTickets.delete(key);
      }
    }

    res.status(200).json({
      success: true,
      ticket: ticketId,
      expiresInSeconds: 60,
    });
  };

  /**
   * Real-time Server-Sent Events (SSE) stream for dispatch updates
   * Supports persistent HTTP connection, Last-Event-ID replay, role authorization, and heartbeats.
   */
  public subscribeToStream = (req: Request, res: Response): void => {
    // 1. Resolve authentication context
    const ticketQuery = req.query.ticket as string | undefined;
    let authContext: StreamTicket = {
      role: (req.query.role as string) || 'admin',
      technicianId: req.query.technicianId as string | undefined,
      customerName: req.query.customerName as string | undefined,
      expiresAt: Infinity,
    };

    if (ticketQuery && streamTickets.has(ticketQuery)) {
      const ticket = streamTickets.get(ticketQuery)!;
      streamTickets.delete(ticketQuery); // Single-use consumption
      if (ticket.expiresAt >= Date.now()) {
        authContext = ticket;
      }
    }

    // 2. Set strict SSE response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const clientId = `client_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const client: StreamClient = {
      id: clientId,
      res,
      role: authContext.role,
      technicianId: authContext.technicianId,
      customerName: authContext.customerName,
      connectedAt: new Date(),
    };
    activeStreamClients.set(clientId, client);

    // 3. Send initial connection confirmation
    const initPayload = {
      type: 'CONNECTED' as const,
      clientId,
      role: client.role,
      timestamp: new Date().toISOString(),
    };
    res.write(`id: evt_init_${Date.now()}\nevent: CONNECTED\ndata: ${JSON.stringify(initPayload)}\n\n`);

    // 4. Handle reconnection: replay missed events via Last-Event-ID
    const lastEventId = (req.headers['last-event-id'] as string) || (req.query.lastEventId as string);
    if (lastEventId) {
      const missedEvents = dispatchEvents.getEventsSince(lastEventId);
      for (const missed of missedEvents) {
        if (this.isEventAuthorizedForClient(missed, client)) {
          res.write(`id: ${missed.id}\nevent: ${missed.type}\ndata: ${JSON.stringify(missed)}\n\n`);
        }
      }
    }

    // 5. Stream active events
    const onDispatchEvent = (event: DispatchEventMessage) => {
      try {
        if (this.isEventAuthorizedForClient(event, client)) {
          res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        }
      } catch (err) {
        console.warn(`[SSE] Error delivering event to client ${clientId}:`, err);
      }
    };

    dispatchEvents.on('dispatch_event', onDispatchEvent);

    // 6. Heartbeat every 15s to keep proxy socket open
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeatTimer);
      }
    }, 15000);

    // 7. Cleanup resources on disconnect
    req.on('close', () => {
      clearInterval(heartbeatTimer);
      dispatchEvents.off('dispatch_event', onDispatchEvent);
      activeStreamClients.delete(clientId);
      res.end();
    });
  };

  /**
   * Role-based authorization filter to ensure clients receive only authorized events
   */
  private isEventAuthorizedForClient(event: DispatchEventMessage, client: StreamClient): boolean {
    if (client.role === 'admin') {
      return true;
    }

    if (client.role === 'technician') {
      // Global broadcast events (schedule/timeline updates) are authorized
      if (['SCHEDULE_UPDATED', 'DISPATCH_STARTED', 'CONNECTED'].includes(event.type)) {
        return true;
      }
      // Target technician events
      if (event.targetTechnicianId && event.targetTechnicianId === client.technicianId) {
        return true;
      }
      // Assignment matching
      if (event.payload?.technicianId && event.payload.technicianId === client.technicianId) {
        return true;
      }
      return false;
    }

    if (client.role === 'user') {
      if (event.type === 'CONNECTED') {
        return true;
      }
      // User only receives events for their own appointments
      if (
        event.targetCustomerName &&
        client.customerName &&
        event.targetCustomerName.toLowerCase().trim() === client.customerName.toLowerCase().trim()
      ) {
        return true;
      }
      if (
        event.payload?.customerName &&
        client.customerName &&
        event.payload.customerName.toLowerCase().trim() === client.customerName.toLowerCase().trim()
      ) {
        return true;
      }
      return false;
    }

    return true;
  };
}

export const autoDispatchController = new AutoDispatchController();
