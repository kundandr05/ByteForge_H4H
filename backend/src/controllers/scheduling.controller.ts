import { Request, Response, NextFunction } from 'express';
import { schedulingService } from '../scheduling/scheduling.service';

export class SchedulingController {
  async generateSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const { runType, weights, idempotencyKey, referenceDate } = req.body;
      const result = await schedulingService.generateSchedule({
        runType,
        weights,
        idempotencyKey,
        referenceDate,
      });

      return res.status(200).json({
        success: true,
        message: 'Workforce schedule generated and optimized successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getCurrentSchedule(_req: Request, res: Response, next: NextFunction) {
    try {
      const schedule = await schedulingService.getCurrentSchedule();
      return res.status(200).json({
        success: true,
        message: 'Current active schedule retrieved successfully.',
        data: schedule,
      });
    } catch (err) {
      next(err);
    }
  }

  async getSchedulingRuns(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const runs = await schedulingService.getSchedulingRuns(page, limit);
      return res.status(200).json({
        success: true,
        message: 'Scheduling runs retrieved successfully.',
        data: runs.data,
        meta: {
          page: runs.pagination.page,
          limit: runs.pagination.limit,
          total: runs.pagination.total,
          totalPages: runs.pagination.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getSchedulingRunById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const run = await schedulingService.getSchedulingRunById(id);
      return res.status(200).json({
        success: true,
        message: 'Scheduling run details retrieved successfully.',
        data: run,
      });
    } catch (err) {
      next(err);
    }
  }

  async getJobExplanation(req: Request, res: Response, next: NextFunction) {
    try {
      const { jobId } = req.params;
      const explanation = await schedulingService.getJobExplanation(jobId);
      return res.status(200).json({
        success: true,
        message: 'Job scheduling explanation retrieved successfully.',
        data: explanation,
      });
    } catch (err) {
      next(err);
    }
  }

  async getTechnicianSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const { technicianId } = req.params;
      const schedule = await schedulingService.getTechnicianSchedule(technicianId);
      return res.status(200).json({
        success: true,
        message: 'Technician timeline schedule retrieved successfully.',
        data: schedule,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const schedulingController = new SchedulingController();
