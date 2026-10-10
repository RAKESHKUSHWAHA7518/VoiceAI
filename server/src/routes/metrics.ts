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
        totalTurns: 0,
        avgLatency: percentiles.e2e_p50 || 0,
        p95Latency: percentiles.e2e_p95 || 0,
        errorRate: 0,
        throughput: 0,
      },
    });
  }
);

// Waterfall Profiler endpoints (Phase 5)
router.get(
  '/waterfall',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const { waterfallProfiler } = require('../services/waterfall');
    const spans = waterfallProfiler.getRecentSpans(limit);
    res.json({
      success: true,
      count: spans.length,
      spans,
    });
  })
);

router.get(
  '/waterfall/report',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const { waterfallProfiler } = require('../services/waterfall');
    const report = waterfallProfiler.getBreakdownReport(limit);
    res.json({
      success: true,
      report,
    });
  })
);

router.post(
  '/waterfall/record',
  asyncHandler(async (req: Request, res: Response) => {
    const { waterfallProfiler } = require('../services/waterfall');
    const {
      agent_name,
      user_query,
      agent_response,
      vad_eos_ms,
      asr_ms,
      llm_ttft_ms,
      tts_first_chunk_ms,
      network_playout_ms,
    } = req.body;

    const span = waterfallProfiler.recordTurnSpan({
      agent_name: agent_name || 'Maya',
      user_query: user_query || 'Customer voice query',
      agent_response: agent_response || 'Spoken assistant answer',
      vad_eos_ms: Number(vad_eos_ms ?? 34),
      asr_ms: Number(asr_ms ?? 150),
      llm_ttft_ms: Number(llm_ttft_ms ?? 210),
      tts_first_chunk_ms: Number(tts_first_chunk_ms ?? 105),
      network_playout_ms: Number(network_playout_ms ?? 30),
    });

    res.status(201).json({
      success: true,
      span,
    });
  })
);

export default router;