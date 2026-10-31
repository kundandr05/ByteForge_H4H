import { Request, Response, NextFunction } from 'express';
import aiBookingService from '../services/aiBooking.service';
import { ApiResponse } from '../types';
import { AppError } from '../utils/appError';

export class AiBookingController {
  public parsePrompt = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { prompt, groqApiKey } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        throw AppError.badRequest('A text prompt or speech transcript is required.', 'VALIDATION_ERROR');
      }

      // Check header or body for optional groqApiKey
      const headerKey = req.headers['x-groq-api-key'] as string | undefined;
      const keyToUse = groqApiKey || headerKey;

      const parsed = await aiBookingService.parseBookingPrompt(prompt, keyToUse);
      res.status(200).json({
        success: true,
        message: 'Prompt parsed successfully',
        data: parsed,
      });
    } catch (error) {
      next(error);
    }
  };

  public bookJob = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        customerName,
        description,
        requiredSkills,
        serviceZone,
        priority,
        estimatedDuration,
        preferredDate,
      } = req.body;

      if (!customerName || !description || !requiredSkills || !serviceZone) {
        throw AppError.badRequest(
          'Missing required booking fields: customerName, description, requiredSkills, serviceZone.',
          'VALIDATION_ERROR'
        );
      }

      const createdJob = await aiBookingService.confirmAndBookJob({
        customerName,
        description,
        requiredSkills,
        serviceZone,
        priority,
        estimatedDuration,
        preferredDate,
      });

      res.status(201).json({
        success: true,
        message: `Appointment for '${customerName}' booked successfully.`,
        data: createdJob,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const aiBookingController = new AiBookingController();
export default aiBookingController;
