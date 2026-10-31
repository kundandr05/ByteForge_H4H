import { Request, Response, NextFunction } from 'express';
import { optimizationService } from '../optimization/optimization.service';
import { z } from 'zod';

const optimizationRequestSchema = z.object({
  maxIterations: z.number().int().positive().max(500).optional(),
  maxDurationMs: z.number().int().positive().max(60000).optional(),
  minImprovementThreshold: z.number().min(0).max(10).optional(),
  weights: z
    .object({
      slaLateness: z.number().min(0).max(1).optional(),
      travelEfficiency: z.number().min(0).max(1).optional(),
      unassignedPriority: z.number().min(0).max(1).optional(),
      workloadBalance: z.number().min(0).max(1).optional(),
      overtime: z.number().min(0).max(1).optional(),
      scheduleStability: z.number().min(0).max(1).optional(),
    })
    .optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
  referenceDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export class OptimizationController {
  async runOptimization(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = optimizationRequestSchema.parse(req.body);
      const result = await optimizationService.runOptimization(validated);

      return res.status(200).json({
        success: true,
        message: 'Schedule optimization executed and committed successfully.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async previewOptimization(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = optimizationRequestSchema.parse(req.body);
      const result = await optimizationService.previewOptimization(validated);

      return res.status(200).json({
        success: true,
        message: 'Schedule optimization preview evaluated successfully without modifying database.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getOptimizationRuns(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const runs = await optimizationService.getOptimizationRuns(page, limit);
      return res.status(200).json({
        success: true,
        message: 'Optimization runs retrieved successfully.',
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

  async getOptimizationRunById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const run = await optimizationService.getOptimizationRunById(id);

      return res.status(200).json({
        success: true,
        message: 'Optimization run details retrieved successfully.',
        data: run,
      });
    } catch (err) {
      next(err);
    }
  }

  async getOptimizationComparison(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const comparison = await optimizationService.getOptimizationComparison(id);

      return res.status(200).json({
        success: true,
        message: 'Optimization before-and-after metrics comparison retrieved successfully.',
        data: comparison,
      });
    } catch (err) {
      next(err);
    }
  }

  async getOptimizationChanges(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const changes = await optimizationService.getOptimizationChanges(id);

      return res.status(200).json({
        success: true,
        message: 'Optimization assignment changes retrieved successfully.',
        data: changes,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const optimizationController = new OptimizationController();
