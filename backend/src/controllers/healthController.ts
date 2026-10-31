import { Request, Response, NextFunction } from 'express';
import { healthService, DatabaseHealthData } from '../services/healthService';
import { ApiResponse, HealthCheckData } from '../types';

export class HealthController {
  public getHealth = async (
    _req: Request,
    res: Response<ApiResponse<HealthCheckData>>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const healthData = await healthService.getHealth();
      res.status(200).json({
        success: true,
        message: 'DispatchGrid service is operational',
        data: healthData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  public getDatabaseHealth = async (
    _req: Request,
    res: Response<ApiResponse<DatabaseHealthData>>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const dbHealth = await healthService.getDatabaseHealth();
      res.status(200).json({
        success: true,
        message: 'Database connection verified successfully',
        data: dbHealth,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}

export const healthController = new HealthController();
export default healthController;
