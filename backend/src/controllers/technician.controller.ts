import { Request, Response, NextFunction } from 'express';
import { technicianService } from '../services/technician.service';
import {
  technicianCreateSchema,
  technicianUpdateSchema,
  technicianAvailabilityUpdateSchema,
  technicianQuerySchema,
} from '../validators/schemas';
import { ApiResponse } from '../types';

export class TechnicianController {
  public createTechnician = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = technicianCreateSchema.parse(req.body);
      const technician = await technicianService.createTechnician(validated);

      res.status(201).json({
        success: true,
        message: 'Technician created successfully',
        data: technician,
      });
    } catch (error) {
      next(error);
    }
  };

  public getTechnicians = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = technicianQuerySchema.parse(req.query);
      const { technicians, meta } = await technicianService.getTechnicians(query);

      res.status(200).json({
        success: true,
        message: 'Technicians retrieved successfully',
        data: technicians,
        meta,
      });
    } catch (error) {
      next(error);
    }
  };

  public getTechnicianById = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const technician = await technicianService.getTechnicianById(id);

      res.status(200).json({
        success: true,
        message: 'Technician retrieved successfully',
        data: technician,
      });
    } catch (error) {
      next(error);
    }
  };

  public updateTechnician = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = technicianUpdateSchema.parse(req.body);
      const technician = await technicianService.updateTechnician(id, validated);

      res.status(200).json({
        success: true,
        message: 'Technician updated successfully',
        data: technician,
      });
    } catch (error) {
      next(error);
    }
  };

  public updateAvailability = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { availabilityStatus } = technicianAvailabilityUpdateSchema.parse(req.body);
      const technician = await technicianService.updateAvailability(id, availabilityStatus);

      res.status(200).json({
        success: true,
        message: `Technician availability updated to '${availabilityStatus}' successfully`,
        data: technician,
      });
    } catch (error) {
      next(error);
    }
  };

  public deleteTechnician = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const force = req.query.force === 'true' || req.body?.force === true;
      const result = await technicianService.deleteTechnician(id, force);

      res.status(200).json({
        success: true,
        message: `Technician '${result.name}' deleted successfully`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const technicianController = new TechnicianController();
export default technicianController;
