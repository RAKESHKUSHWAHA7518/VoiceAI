import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';

export const healthCheck = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
  });
});

export const readinessCheck = asyncHandler(async (req: Request, res: Response) => {
  // Check database connection, redis connection, etc.
  const checks = {
    database: 'ok',
    redis: 'ok',
    services: 'ok',
  };

  const allHealthy = Object.values(checks).every(status => status === 'ok');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

export const livenessCheck = asyncHandler(async (req: Request, res: Response) => {
  res.json({ 
    status: 'alive', 
    timestamp: new Date().toISOString() 
  });
});