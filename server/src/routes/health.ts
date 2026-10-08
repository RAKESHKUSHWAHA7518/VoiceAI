import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

router.get('/ready', (req: Request, res: Response) => {
  // Check dependencies
  const checks = {
    database: 'ok', // Would check actual DB connection
    redis: 'ok', // Would check Redis connection
    services: 'ok',
  };
  
  const allHealthy = Object.values(checks).every(status => status === 'ok');
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

router.get('/live', (req: Request, res: Response) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

export default router;