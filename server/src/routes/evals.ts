import { workspaceEvals } from '../services/workspace_demos';
// ============================================================================
// VoiceAI - Automated Agent Testing & Batch Evals Routes
// ============================================================================

import { Router, Request, Response } from 'express';
import { evalEngine } from '../services/evals';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// GET all test suites
router.get(
  '/suites',
  asyncHandler(async (req: Request, res: Response) => {
    const suites = workspaceEvals(req).listSuites();
    res.json({
      success: true,
      suites,
    });
  })
);

// GET single test suite by ID
router.get(
  '/suites/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const suite = workspaceEvals(req).getSuite(req.params.id);
    if (!suite) {
      return res.status(404).json({ success: false, error: 'Test suite not found' });
    }
    res.json({ success: true, suite });
  })
);

// GET all evaluation runs
router.get(
  '/runs',
  asyncHandler(async (req: Request, res: Response) => {
    const runs = workspaceEvals(req).listRuns();
    res.json({
      success: true,
      count: runs.length,
      runs,
    });
  })
);

// GET single run details & scorecard
router.get(
  '/runs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const run = workspaceEvals(req).getRun(req.params.id);
    if (!run) {
      return res.status(404).json({ success: false, error: 'Run record not found' });
    }
    res.json({ success: true, run });
  })
);

// POST execute batch evaluation run
router.post(
  '/run',
  asyncHandler(async (req: Request, res: Response) => {
    const { suite_id, agent_id, agent_name } = req.body;
    if (!suite_id) {
      return res.status(400).json({ success: false, error: 'suite_id is required' });
    }

    const runRecord = await workspaceEvals(req).executeEvaluationRun({
      suite_id,
      agent_id: agent_id || 'agent_support',
      agent_name: agent_name || 'Maya',
    });

    res.status(201).json({
      success: true,
      run: runRecord,
    });
  })
);

export default router;
