import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/appError';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected server error occurred';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    const fieldErrors = err.errors.map((e) => {
      const field = e.path.join('.');
      return field ? `${field}: ${e.message}` : e.message;
    });
    message = `Validation failed: ${fieldErrors.join('; ')}`;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      code = 'DUPLICATE_RESOURCE';
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      message = `A resource with this unique ${target} already exists.`;
    } else if (err.code === 'P2025') {
      statusCode = 404;
      code = 'NOT_FOUND';
      message = 'Requested resource not found.';
    } else if (err.code === 'P2003') {
      statusCode = 400;
      code = 'FOREIGN_KEY_VIOLATION';
      message = 'Operation violates foreign key constraints.';
    } else {
      statusCode = 400;
      code = `PRISMA_${err.code}`;
      message = 'Database operation failed.';
    }
  } else if (err instanceof Error) {
    message = err.message || message;
  }

  // Log errors
  if (statusCode >= 500) {
    logger.error(`[${req.method} ${req.url}] ${statusCode} - ${message}`, {
      stack: err instanceof Error ? err.stack : undefined,
    });
  } else {
    logger.warn(`[${req.method} ${req.url}] ${statusCode} - ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    code,
    error: {
      code,
      message,
      statusCode,
    },
  });
};

export default errorHandler;
