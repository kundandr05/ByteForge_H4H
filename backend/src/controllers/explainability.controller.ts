import { Request, Response, NextFunction } from 'express';
import { explainabilityService } from '../services/explainability.service';

export class ExplainabilityController {
  public async explainJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const explanation = await explainabilityService.explainJob(jobId);

      res.status(200).json({
        status: 'success',
        data: explanation,
      });
    } catch (error) {
      next(error);
    }
  }

  public async explainAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { assignmentId } = req.params;
      const explanation = await explainabilityService.explainAssignment(assignmentId);

      res.status(200).json({
        status: 'success',
        data: explanation,
      });
    } catch (error) {
      next(error);
    }
  }

  public async explainSchedulingRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { runId } = req.params;
      const explanation = await explainabilityService.explainSchedulingRun(runId);

      res.status(200).json({
        status: 'success',
        data: explanation,
      });
    } catch (error) {
      next(error);
    }
  }

  public async explainOptimizationRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { runId } = req.params;
      const explanation = await explainabilityService.explainOptimizationRun(runId);

      res.status(200).json({
        status: 'success',
        data: explanation,
      });
    } catch (error) {
      next(error);
    }
  }

  public async explainRecoveryRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { runId } = req.params;
      const explanation = await explainabilityService.explainRecoveryRun(runId);

      res.status(200).json({
        status: 'success',
        data: explanation,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const explainabilityController = new ExplainabilityController();
