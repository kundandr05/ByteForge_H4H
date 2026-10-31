import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { config } from './config';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import { setupSwagger } from './config/swagger';
import { AppError } from './utils/appError';

export const createApp = (): Express => {
  const app = express();

  // Configure CORS
  const allowedOrigins = config.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(new AppError(`Origin ${origin} not allowed by CORS`, 403));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'X-Idempotency-Key',
        'X-Request-Id',
        'Accept',
      ],
    })
  );

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use(requestLogger);

  // Mount Swagger documentation at /api/docs
  setupSwagger(app);

  // Mount API routes
  app.use('/api', routes);

  // Root welcome route
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'DispatchGrid API',
      status: 'operational',
      documentation: '/api/docs',
      health: '/api/health',
      timestamp: new Date().toISOString(),
    });
  });

  // 404 Not Found handler for undefined routes
  app.use((req: Request, _res: Response, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, 'NOT_FOUND'));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
};

export const app = createApp();
export default app;
