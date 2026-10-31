import { Request, Response, NextFunction } from 'express';
import customerService from '../services/customer.service';
import { ApiResponse } from '../types';
import { AppError } from '../utils/appError';

export class CustomerController {
  public getAllCustomers = async (
    _req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const customers = await customerService.getAllCustomers();
      res.status(200).json({
        success: true,
        message: 'Customers retrieved successfully',
        data: customers,
      });
    } catch (error) {
      next(error);
    }
  };

  public getCustomerByName = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { name } = req.params;
      const customer = await customerService.getCustomerByName(name);
      if (!customer) {
        throw AppError.notFound(`Customer '${name}' not found.`, 'CUSTOMER_NOT_FOUND');
      }
      res.status(200).json({
        success: true,
        message: `Customer '${name}' retrieved successfully`,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const customerController = new CustomerController();
export default customerController;
