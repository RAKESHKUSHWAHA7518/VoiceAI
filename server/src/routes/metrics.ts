import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validation';
import { schemas } from '../middleware/validation';
import { getMetricsCollector } from '../telemetry/latency_spans';

const router = Router();

router.get(
  '/percentiles',
  asyncHandler(async (req: any, res: any) => {
    const window = parseInt(req.query.window as string) || 1000;
    const metricsCollector = require('../telemetry/latency_spans').getMetricsCollector();
    const percentiles = await metricsCollector.getPercentiles(window);
    
    res.json({
      success: true,
      window,
      percentiles,
    });
  })
);

router.get(
  '/recent',
  async (req: any, res: any) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const metricsCollector = require('../telemetry/latency_spans').getMetricsCollector();
    const turns = await metricsCollector.getRecentTurns(limit);
    
    res.json({
      success: true,
      turns,
    });
  });

router.get(
  '/summary',
  async (req: any, res: any) => {
    const metricsCollector = require('../telemetry/latency_spans').getMetricsCollector();
    const percentiles = await metricsCollector.getPercentiles(1000);
    
    res.json({
      success: true,
      summary: {
        totalTurns: 0, // Would come from metrics collector
        avgLatency: percentiles.e2e_p50 || 0,
        p95Latency: percentiles.e2e_p95 || 0,
        errorRate: 0,
        throughput: 0,
      },
    });
  });

export default router;