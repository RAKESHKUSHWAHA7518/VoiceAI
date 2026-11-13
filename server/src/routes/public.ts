import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { resolveDeployment, deploymentEvents } from '../services/deployments';
import { createConversation, persistConversationStart, closeConversation, interruptConversation } from '../services/conversations';
import { turnHandler, timingHandler } from './conversations';
import { asyncHandler } from '../middleware/errorHandler';
import { startRecording, uploadRecording, recordingBody } from './recordings';
import { speakHandler } from './speech';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();
const guests = new Map<string, { hash: string; expires: number; workspace: string; deployment: string; turns: number }>();
const dailyStarts = new Map<string, number>();
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
router.post('/demo', rateLimiter({ prefix: 'voice-demo', windowMs: 60000, maxRequests: 5 }), (_req, res) => {
  const agent = { id: 'public-demo', name: 'Maya', role: 'Voice demo assistant', avatar: '🎧', voice_id: 'browser', llm_model: 'demo', llm_temperature: 0.3, system_prompt: 'Help visitors test their microphone.', assigned_tools: [], greeting: "Hi, I'm Maya. Click the microphone, then say hello, or ask me what I can do.", default_language: 'en', languages_supported: ['en'] };
  try {
    for (const [id, guest] of guests) if (guest.expires < Date.now()) { closeConversation(guest.workspace, id); guests.delete(id); }
    const workspace = `demo_${crypto.randomUUID()}`;
    const session = createConversation(workspace, agent, { mode: 'demo' });
    const token = crypto.randomBytes(32).toString('hex');
    guests.set(session.session_id, { hash: hash(token), expires: Date.now() + 10 * 60000, workspace, deployment: 'demo', turns: 0 });
    res.status(201).json({ success: true, ...session, token, agent });
  } catch { res.status(429).json({ success: false, error: { message: 'The demo is busy. Please try again shortly.' } }); }
});
deploymentEvents.on('disabled', (deployment: string) => {
  for (const [id, guest] of guests) if (guest.deployment === deployment) { closeConversation(guest.workspace, id); guests.delete(id); }
});
router.use(rateLimiter({ prefix: 'widget', windowMs: 60000, maxRequests: 60 }));
router.post('/deployments/:id/sessions', rateLimiter({ prefix: 'widget-start', windowMs: 60000, maxRequests: 10 }), asyncHandler(async (req: Request, res: Response) => {
  for (const [id, guest] of guests) if (guest.expires < Date.now()) { closeConversation(guest.workspace, id); guests.delete(id); }
  const origin = req.get('origin');
  if (!origin || origin === 'null') return res.status(403).json({ success: false, error: { message: 'Open this widget from an allowed website.' } });
  const resolved = resolveDeployment(req.params.id, origin);
  if (!resolved) return res.status(403).json({ success: false, error: { message: 'This website is not allowed or the widget was disabled.' } });
  if (resolved.deployment.runtime_mode === 'live' && process.env.VOICEAI_PUBLIC_LIVE !== 'true') return res.status(503).json({ success: false, error: { message: 'Public live AI is disabled. Ask the owner for a demo preview or use the signed-in playground.' } });
  const day = new Date().toISOString().slice(0, 10);
  for (const key of dailyStarts.keys()) if (!key.endsWith(day)) dailyStarts.delete(key);
  const key = `${req.params.id}:${day}`;
  if ((dailyStarts.get(key) || 0) >= 20) return res.status(429).json({ success: false, error: { message: 'This demo widget has reached its daily session limit.' } });
  try {
    const session = createConversation(resolved.deployment.workspace_id, resolved.version.snapshot, { mode: resolved.deployment.runtime_mode || 'demo', saveHistory: true, browserSpeech: resolved.deployment.runtime_mode !== 'live', deployment_id: resolved.deployment.id, version_id: resolved.version.id, origin });
    await persistConversationStart(resolved.deployment.workspace_id, session.session_id);
    const token = crypto.randomBytes(32).toString('hex');
    guests.set(session.session_id, { hash: hash(token), expires: Date.now() + 10 * 60000, workspace: resolved.deployment.workspace_id, deployment: req.params.id, turns: 0 });
    dailyStarts.set(key, (dailyStarts.get(key) || 0) + 1);
    res.set({ 'Access-Control-Allow-Origin': origin, 'Cache-Control': 'no-store' }); res.vary('Origin');
    res.status(201).json({ success: true, ...session, token, agent_name: resolved.version.snapshot.name, expires_in: 600 });
  } catch { res.status(429).json({ success: false, error: { message: 'All demo conversation slots are busy. Please try later.' } }); }
}));
function guestAccess(req: Request, res: Response, next: NextFunction) {
  const guest = guests.get(req.params.id);
  const token = req.get('authorization')?.replace(/^Bearer /, '');
  if (!guest || guest.expires < Date.now() || !token || token.length !== 64 || !crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(guest.hash)) || (guest.deployment !== 'demo' && !resolveDeployment(guest.deployment))) return res.status(401).json({ success: false, error: { message: 'Widget session expired or unavailable.' } });
  if (guest.deployment !== 'demo' && resolveDeployment(guest.deployment)?.deployment.runtime_mode === 'live' && process.env.VOICEAI_PUBLIC_LIVE !== 'true') return res.status(503).json({ error: { message: 'Public live AI is disabled on this server.' } });
  (req as any).user = { workspaceId: guest.workspace, roles: [] };
  if (req.path.endsWith('/turn')) {
    if (guest.turns >= 10) return res.status(429).json({ success: false, error: { message: 'This preview is limited to ten messages.' } });
    guest.turns++;
  }
  next();
}
router.post('/sessions/:id/recording/start', guestAccess, startRecording);
router.post('/sessions/:id/recording', guestAccess, recordingBody, uploadRecording);
router.post('/sessions/:id/speak', guestAccess, (req, res, next) => { const guest = guests.get(req.params.id)!; const deployment = resolveDeployment(guest.deployment); if (!deployment || deployment.deployment.runtime_mode !== 'live') return res.status(403).json({ error: { message: 'Cloud voice is available only for live widgets.' } }); return speakHandler(req, res, next); });
router.post('/sessions/:id/timing', guestAccess, timingHandler);
router.post('/sessions/:id/turn', guestAccess, turnHandler);
router.post('/sessions/:id/interrupt', guestAccess, (req, res) => { const guest = guests.get(req.params.id)!; interruptConversation(guest.workspace, req.params.id); res.json({ success: true }); });
router.delete('/sessions/:id', guestAccess, (req, res) => { const guest = guests.get(req.params.id)!; closeConversation(guest.workspace, req.params.id); guests.delete(req.params.id); res.json({ success: true }); });
export default router;

