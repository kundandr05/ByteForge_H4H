import { Request, Response, NextFunction } from 'express';
import { autoDispatchService } from '../services/autoDispatch.service';
import { technicianService } from '../services/technician.service';
import { AppError } from '../utils/appError';
import { ApiResponse } from '../types';
import { dispatchEvents } from '../utils/dispatchEvents';

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
   * Real-time Server-Sent Events (SSE) stream for dispatch updates
   */
  public subscribeToStream = (req: Request, res: Response): void => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Initial handshake event
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

    const onDispatchUpdate = (eventData: any) => {
      try {
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);
      } catch (err) {
        console.warn('Error writing SSE stream:', err);
      }
    };

    dispatchEvents.on('dispatch_update', onDispatchUpdate);

    // Heartbeat every 15s to keep proxy socket open
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      dispatchEvents.off('dispatch_update', onDispatchUpdate);
      res.end();
    });
  };
}

export const autoDispatchController = new AutoDispatchController();
