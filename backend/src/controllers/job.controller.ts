import { Request, Response, NextFunction } from 'express';
import { jobService } from '../services/job.service';
import {
  jobCreateSchema,
  jobUpdateSchema,
  jobStatusUpdateSchema,
  jobQuerySchema,
} from '../validators/schemas';
import { ApiResponse } from '../types';

export class JobController {
  public createJob = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = jobCreateSchema.parse(req.body);
      const job = await jobService.createJob(validated);

      res.status(201).json({
        success: true,
        message: 'Job created successfully',
        data: job,
      });
    } catch (error) {
      next(error);
    }
  };

  public getJobs = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = jobQuerySchema.parse(req.query);
      const { jobs, meta } = await jobService.getJobs(query);

      res.status(200).json({
        success: true,
        message: 'Jobs retrieved successfully',
        data: jobs,
        meta,
      });
    } catch (error) {
      next(error);
    }
  };

  public getJobById = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const job = await jobService.getJobById(id);

      res.status(200).json({
        success: true,
        message: 'Job retrieved successfully',
        data: job,
      });
    } catch (error) {
      next(error);
    }
  };

  public updateJob = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = jobUpdateSchema.parse(req.body);
      const job = await jobService.updateJob(id, validated);

      res.status(200).json({
        success: true,
        message: 'Job updated successfully',
        data: job,
      });
    } catch (error) {
      next(error);
    }
  };

  public updateJobStatus = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = jobStatusUpdateSchema.parse(req.body);
      const job = await jobService.updateJobStatus(id, status);

      res.status(200).json({
        success: true,
        message: `Job status updated to '${status}' successfully`,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  };

  public deleteJob = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await jobService.deleteJob(id);

      res.status(200).json({
        success: true,
        message: `Job '${result.customerName}' deleted successfully`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const jobController = new JobController();
export default jobController;
