import { Request, Response, NextFunction } from 'express';
import { recoveryService } from '../recovery/recovery.service';
import { disruptionEventCreateSchema } from '../validators/schemas';

export class DisruptionController {
  public async createDisruption(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = disruptionEventCreateSchema.parse(req.body);
      const disruption = await recoveryService.createDisruption(validated as any);

      res.status(201).json({
        status: 'success',
        data: disruption,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getDisruptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const status = req.query.status ? String(req.query.status) : undefined;
      const type = req.query.type ? String(req.query.type) : undefined;

      const result = await recoveryService.getDisruptions(page, limit, status, type);

      res.status(200).json({
        status: 'success',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getDisruptionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const disruption = await recoveryService.getDisruptionById(id);

      res.status(200).json({
        status: 'success',
        data: disruption,
      });
    } catch (error) {
      next(error);
    }
  }

  public async recoverDisruption(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { referenceDate, idempotencyKey } = req.body || {};

      const result = await recoveryService.recoverDisruption(id, {
        referenceDate: referenceDate ? new Date(referenceDate) : undefined,
        idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      });

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getRecoveryReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const report = await recoveryService.getRecoveryReport(id);

      res.status(200).json({
        status: 'success',
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getRecoveryHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      const history = await recoveryService.getRecoveryHistory(page, limit);

      res.status(200).json({
        status: 'success',
        data: history.data,
        pagination: history.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getRecoveryComparison(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const comparison = await recoveryService.getRecoveryComparison(id);

      res.status(200).json({
        status: 'success',
        data: comparison,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const disruptionController = new DisruptionController();
