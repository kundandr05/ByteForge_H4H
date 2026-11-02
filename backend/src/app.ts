import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import { setupSwagger } from './config/swagger';
import { AppError } from './utils/appError';

export const createApp = (): Express => {
  const app = express();

  // Configure CORS with production & multi-environment compatibility
  const allowedOrigins = config.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);

        // Allow wildcard or explicit origin matches
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Always allow localhost, render.com, and vercel.app domains
        try {
          const parsed = new URL(origin);
          if (
            parsed.hostname === 'localhost' ||
            parsed.hostname === '127.0.0.1' ||
            parsed.hostname.endsWith('.onrender.com') ||
            parsed.hostname.endsWith('.vercel.app')
          ) {
            return callback(null, true);
          }
        } catch {
          // ignore invalid URLs
        }

        // In production unified mode, allow all web clients rather than failing static assets
        if (process.env.NODE_ENV === 'production' || config.NODE_ENV === 'production') {
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

  // Check if frontend build dist exists to serve as unified full-stack application
  const candidateDistPaths = [
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
  ];
  const frontendDistPath = candidateDistPaths.find((p) => fs.existsSync(p)) || candidateDistPaths[0];

  if (fs.existsSync(frontendDistPath)) {
    // Serve static assets from frontend/dist
    app.use(express.static(frontendDistPath));

    // Handle React client-side SPA routing (fallback for non-API routes)
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  } else {
    // Root welcome route for API-only mode
    app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'DispatchGrid API',
        status: 'operational',
        documentation: '/api/docs',
        health: '/api/health',
        timestamp: new Date().toISOString(),
      });
    });
  }

  // 404 Not Found handler for undefined API routes
  app.use((req: Request, _res: Response, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, 'NOT_FOUND'));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
};

export const app = createApp();
export default app;
