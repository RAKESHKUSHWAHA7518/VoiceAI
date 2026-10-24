import { workspaceHandoff } from '../services/workspace_demos';
// ============================================================================
// VoiceAI - Human-in-the-Loop (HITL) Routes
// ============================================================================

import { Router, Request, Response } from 'express';
import { hitlEngine } from '../services/hitl';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// GET all active calls
router.get(
  '/active-calls',
  asyncHandler(async (req: Request, res: Response) => {
    const calls = workspaceHandoff(req).listActiveCalls();
    res.json({
      success: true,
      count: calls.length,
      calls,
    });
  })
);

// GET single active call
router.get(
  '/calls/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const call = workspaceHandoff(req).getCall(req.params.id);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found or ended' });
    }
    res.json({ success: true, call });
  })
);

// POST register new call
router.post(
  '/calls',
  asyncHandler(async (req: Request, res: Response) => {
    const { id, session_id, agent_id, agent_name, agent_role, caller_name, caller_phone, channel } = req.body;
    if (!agent_name) {
      return res.status(400).json({ success: false, error: 'agent_name is required' });
    }
    const call = workspaceHandoff(req).registerCall({
      id,
      session_id,
      agent_id: agent_id || 'agent_support',
      agent_name,
      agent_role,
      caller_name,
      caller_phone,
      channel,
    });
    res.status(201).json({ success: true, call });
  })
);

// POST record message (user or assistant) and trigger automated escalation checks
router.post(
  '/calls/:id/message',
  asyncHandler(async (req: Request, res: Response) => {
    const { role, text } = req.body;
    if (!role || !text) {
      return res.status(400).json({ success: false, error: 'role and text are required' });
    }
    const call = workspaceHandoff(req).recordMessage(req.params.id, role, text);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }
    res.json({ success: true, call });
  })
);

// POST manually escalate a call
router.post(
  '/calls/:id/escalate',
  asyncHandler(async (req: Request, res: Response) => {
    const { reason } = req.body;
    const call = workspaceHandoff(req).escalateCall(req.params.id, reason || 'Manual supervisor escalation requested');
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }
    res.json({ success: true, call });
  })
);

// POST supervisor enters silent whisper mode
router.post(
  '/calls/:id/whisper',
  asyncHandler(async (req: Request, res: Response) => {
    const { supervisor_name } = req.body;
    const call = workspaceHandoff(req).setWhisperMode(req.params.id, supervisor_name || 'Supervisor Sarah');
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }
    res.json({ success: true, call });
  })
);

// POST supervisor takes over call (mutes AI agent, bridges human mic)
router.post(
  '/calls/:id/takeover',
  asyncHandler(async (req: Request, res: Response) => {
    const { supervisor_name } = req.body;
    const call = workspaceHandoff(req).takeoverCall(req.params.id, supervisor_name || 'Supervisor Sarah');
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }
    res.json({ success: true, call });
  })
);

// POST hand back control to AI agent
router.post(
  '/calls/:id/handback',
  asyncHandler(async (req: Request, res: Response) => {
    const call = workspaceHandoff(req).handbackToAI(req.params.id);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }
    res.json({ success: true, call });
  })
);

// POST warm transfer call to phone number or department
router.post(
  '/calls/:id/transfer',
  asyncHandler(async (req: Request, res: Response) => {
    const { target_phone, department } = req.body;
    if (!target_phone) {
      return res.status(400).json({ success: false, error: 'target_phone is required' });
    }
    const call = workspaceHandoff(req).transferCall(req.params.id, target_phone, department);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }
    res.json({ success: true, call });
  })
);

// POST end active call
router.post(
  '/calls/:id/end',
  asyncHandler(async (req: Request, res: Response) => {
    const call = workspaceHandoff(req).endCall(req.params.id);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }
    res.json({ success: true, call });
  })
);

// POST refresh copilot suggestions
router.post(
  '/calls/:id/copilot-suggest',
  asyncHandler(async (req: Request, res: Response) => {
    const { latest_query } = req.body;
    const suggestions = workspaceHandoff(req).generateCopilotSuggestions(req.params.id, latest_query);
    res.json({ success: true, suggestions });
  })
);

export default router;
