import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';

export class AuditController {
  public async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        page,
        limit,
        entityType,
        action,
        startDate,
        endDate,
        sortBy,
        sortOrder,
      } = req.query;

      const result = await auditService.query({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        entityType: entityType ? String(entityType) : undefined,
        action: action ? String(action) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        sortBy: (sortBy as any) || 'createdAt',
        sortOrder: (sortOrder as any) || 'desc',
      });

      res.status(200).json({
        status: 'success',
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getAuditLogById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const log = await auditService.getById(id);

      res.status(200).json({
        status: 'success',
        data: log,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getAuditLogsByEntity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { entityType, entityId } = req.params;
      const { page, limit } = req.query;

      const result = await auditService.getByEntity(entityType, entityId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });

      res.status(200).json({
        status: 'success',
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const auditController = new AuditController();
