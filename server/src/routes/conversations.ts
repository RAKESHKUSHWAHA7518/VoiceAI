import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { workspaceId } from '../middleware/workspace';
import { getAgentById, ownsAgent } from './agents';
import { createConversation, findConversation, closeConversation, interruptConversation, conversationTurn } from '../services/conversations';
import { historyForWorkspace, historyRecord } from '../services/conversation_history';

const router = Router();
router.get('/history', (req, res) => res.json({ success: true, conversations: historyForWorkspace(workspaceId(req)!) }));
router.get('/history/:id', (req, res) => {
  const record = historyRecord(workspaceId(req)!, req.params.id);
  return record ? res.json({ success: true, conversation: record }) : res.status(404).json({ success: false, error: { message: 'Conversation not found' } });
});
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { agent_id } = z.object({ agent_id: z.string().min(1) }).parse(req.body);
  if (!workspaceId(req) || !ownsAgent(req, agent_id)) return res.status(404).json({ success: false, error: { message: 'Agent not found' } });
  try { res.status(201).json({ success: true, ...createConversation(workspaceId(req)!, getAgentById(agent_id)!, { saveHistory: true, enableTools: true }) }); }
  catch { res.status(429).json({ success: false, error: { message: 'End an existing conversation before starting another.' } }); }
}));
export const turnHandler = asyncHandler(async (req: Request, res: Response) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body);
  const session = findConversation(workspaceId(req)!, req.params.id);
  if (!session) return res.status(404).json({ success: false, error: { message: 'Conversation expired or not found' } });
  if (session.active) return res.status(409).json({ success: false, error: { message: 'Wait for the current turn or interrupt it first.' } });
  res.set({ 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  const cancel = () => { if (!res.writableEnded) interruptConversation(workspaceId(req)!, req.params.id); };
  res.on('close', cancel);
  try {
    for await (const event of conversationTurn(session, text)) {
      if (res.destroyed) break;
      const ready = res.write(JSON.stringify(event) + '\n');
      res.flush?.();
      if (!ready) await new Promise<void>(resolve => { const done = () => { res.off('drain', done); res.off('close', done); resolve(); }; res.once('drain', done); res.once('close', done); });
    }
  } catch (error) {
    const code = error instanceof Error && ['TURN_CANCELLED', 'PROVIDER_NOT_CONFIGURED', 'TURN_LIMIT', 'EMPTY_RESPONSE', 'PROVIDER_RATE_LIMITED', 'PROVIDER_AUTH_FAILED', 'PROVIDER_MODEL_UNAVAILABLE', 'TOOL_CALL_LIMIT'].includes(error.message) ? error.message : 'PROVIDER_ERROR';
    if (!res.destroyed) res.write(JSON.stringify({ type: 'error', code, message: code === 'PROVIDER_NOT_CONFIGURED' ? 'Configure a provider key and select its model, or use demo mode.' : code === 'PROVIDER_RATE_LIMITED' ? 'The model provider is at its quota or rate limit. Please retry later.' : code === 'PROVIDER_AUTH_FAILED' ? 'The model provider rejected the server credentials. Check server configuration.' : code === 'PROVIDER_MODEL_UNAVAILABLE' ? 'This model is unavailable. Choose a model enabled for your provider account.' : code === 'TOOL_CALL_LIMIT' ? 'The tool-call limit was reached. Start a new conversation or simplify the request.' : code === 'TURN_CANCELLED' ? 'The turn was interrupted or timed out.' : 'The conversation could not complete. Please try again.' }) + '\n');
  } finally { res.off('close', cancel); res.end(); }
});
router.post('/:id/turn', turnHandler);
router.post('/:id/interrupt', (req, res) => res.status(interruptConversation(workspaceId(req)!, req.params.id) ? 200 : 404).json({ success: true }));
router.delete('/:id', (req, res) => res.status(closeConversation(workspaceId(req)!, req.params.id) ? 200 : 404).json({ success: true }));
export default router;
