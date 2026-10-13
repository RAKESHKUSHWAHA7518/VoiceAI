import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config';
import { readinessCheck } from '../controllers/health';

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

router.get('/ready', readinessCheck);

router.get('/live', (req: Request, res: Response) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

export default router;
