import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { workspaceId } from '../middleware/workspace';
import { getAgentById, ownsAgent } from './agents';
import { createConversation, persistConversationStart, findConversation, closeConversation, interruptConversation, conversationTurn } from '../services/conversations';
import { pagedHistory, historyRecord } from '../services/conversation_history';

import { startRecording, uploadRecording, recordingBody, playRecording, deleteRecording } from './recordings';
import { recordingSummary } from '../services/recordings';
import { requireWorkspace, sameOrigin } from '../middleware/workspace';
const router = Router();
router.post('/:id/recording/start', requireWorkspace, sameOrigin, startRecording);
router.post('/:id/recording', requireWorkspace, sameOrigin, recordingBody, uploadRecording);
router.get('/history/:id/recording', requireWorkspace, playRecording);
router.delete('/history/:id/recording', requireWorkspace, sameOrigin, deleteRecording);
router.get('/history', (req, res) => {
  const query = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), page_size: z.coerce.number().int().min(1).max(50).default(10), q: z.string().trim().max(200).default('') }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { message: 'Use a positive page number, 1–50 conversations per page, and a search of at most 200 characters.' } });
  return res.json({ success: true, ...pagedHistory(workspaceId(req)!, query.data.page, query.data.page_size, query.data.q) });
});
router.get('/history/:id', (req, res) => {
  const record = historyRecord(workspaceId(req)!, req.params.id);
  return record ? res.json({ success: true, conversation: { ...record, recording: recordingSummary(workspaceId(req)!, record.id) } }) : res.status(404).json({ success: false, error: { message: 'Conversation not found' } });
});
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { agent_id } = z.object({ agent_id: z.string().min(1) }).parse(req.body);
  if (!workspaceId(req) || !ownsAgent(req, agent_id)) return res.status(404).json({ success: false, error: { message: 'Agent not found' } });
  try { const opened = createConversation(workspaceId(req)!, getAgentById(agent_id)!, { saveHistory: true, enableTools: true }); await persistConversationStart(workspaceId(req)!, opened.session_id); res.status(201).json({ success: true, ...opened }); }
  catch { res.status(429).json({ success: false, error: { message: 'End an existing conversation before starting another.' } }); }
}));
export const turnHandler = asyncHandler(async (req: Request, res: Response) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body);
  const session = findConversation(workspaceId(req)!, req.params.id);
  if (!session) return res.status(404).json({ success: false, error: { message: 'Conversation expired or not found' } });
  if (session.active) {
    session.active.abort();
    session.active = undefined;
  }
  res.set({ 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  // A disconnected old request must never abort a newer turn in this session.
  const turnAbort = new AbortController();
  const cancel = () => { if (!res.writableEnded) turnAbort.abort(); };
  res.on('close', cancel);
  try {
    for await (const event of conversationTurn(session, text, turnAbort)) {
      if (res.destroyed) break;
      const ready = res.write(JSON.stringify(event) + '\n');
      res.flush?.();
      if (!ready) await new Promise<void>(resolve => { const done = () => { res.off('drain', done); res.off('close', done); resolve(); }; res.once('drain', done); res.once('close', done); });
    }
  } catch (error) {
    const code = error instanceof Error && ['TURN_CANCELLED', 'TURN_TIMEOUT', 'PROVIDER_NOT_CONFIGURED', 'TURN_LIMIT', 'EMPTY_RESPONSE', 'PROVIDER_RATE_LIMITED', 'PROVIDER_AUTH_FAILED', 'PROVIDER_MODEL_UNAVAILABLE', 'TOOL_CALL_LIMIT', 'HISTORY_SAVE_FAILED'].includes(error.message) ? error.message : 'PROVIDER_ERROR';
    if (!res.destroyed) res.write(JSON.stringify({ type: 'error', code, message: code === 'HISTORY_SAVE_FAILED' ? 'The reply could not be saved to conversation history. Your previous context is unchanged. Please try again.' : code === 'PROVIDER_NOT_CONFIGURED' ? 'Configure a provider key and select its model, or use demo mode.' : code === 'PROVIDER_RATE_LIMITED' ? 'The model provider quota is exhausted or rate-limited. Check billing or select Google Gemini Flash in Agent settings.' : code === 'PROVIDER_AUTH_FAILED' ? 'The model provider rejected the server credentials. Check server configuration.' : code === 'PROVIDER_MODEL_UNAVAILABLE' ? 'This model is unavailable. Choose a model enabled for your provider account.' : code === 'TOOL_CALL_LIMIT' ? 'The tool-call limit was reached. Start a new conversation or simplify the request.' : code === 'TURN_TIMEOUT' ? 'The model response timed out. Please retry.' : code === 'TURN_CANCELLED' ? 'The caller interrupted this turn.' : 'The conversation could not complete. Please try again.' }) + '\n');
  } finally { res.off('close', cancel); res.end(); }
});
router.post('/:id/turn', turnHandler);
router.post('/:id/interrupt', (req, res) => res.status(interruptConversation(workspaceId(req)!, req.params.id) ? 200 : 404).json({ success: true }));
router.delete('/:id', (req, res) => res.status(closeConversation(workspaceId(req)!, req.params.id) ? 200 : 404).json({ success: true }));
export default router;
