import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getMetricsCollector } from '../telemetry/latency_spans';

export const getPercentiles = async (req: Request, res: Response) => {
  const window = parseInt(req.query.window as string) || 1000;
  const metricsCollector = getMetricsCollector();
  const percentiles = await metricsCollector.getPercentiles(window);
  
  res.json({
    success: true,
    window,
    percentiles,
  });
};

export const getRecentTurns = async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const metricsCollector = getMetricsCollector();
  const turns = await metricsCollector.getRecentTurns(limit);
  
  res.json({
    success: true,
    turns,
  });
};

export default {
  getPercentiles,
  getRecentTurns,
};