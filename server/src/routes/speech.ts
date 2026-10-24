import { speechSegments } from '../../../shared/speechSegments';
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import config from '../config';
import { findConversation } from '../services/conversations';
import { requireWorkspace, sameOrigin, workspaceId } from '../middleware/workspace';
import { accountForToken } from '../services/accounts';
import { asyncHandler } from '../middleware/errorHandler';
const router = Router();
const tickets = new Map<string, { workspace: string; session: string; expires: number }>();
const usage = new Map<string, { until: number; tickets: number; chars: number; speaking: boolean }>();
const active = new Map<string, number>();
function budget(workspace: string) {
 const now = Date.now();
 for (const [key, value] of usage) if (value.until < now) usage.delete(key);
 for (const [key, value] of tickets) if (value.expires < now) tickets.delete(key);
 if (!usage.has(workspace)) { if (usage.size >= 500) throw new Error('Speech capacity reached'); usage.set(workspace, { until: now + 3600000, tickets: 0, chars: 0, speaking: false }); }
 return usage.get(workspace)!;
}
router.use(requireWorkspace, sameOrigin);
router.post('/:id/speech-ticket', asyncHandler(async (req: Request, res: Response) => {
 const workspace = workspaceId(req)!; const session = findConversation(workspace, req.params.id);
 if (!session) return res.status(404).json({ error: { message: 'Conversation not found.' } });
 if (process.env.VOICEAI_SPEECH_MODE !== 'cloud' || !config.apiKeys.deepgram) return res.status(503).json({ error: { message: 'Deepgram speech is not configured.' } });
 const limits = budget(workspace);
 if (limits.tickets >= 12 || (active.get(workspace) || 0) >= 1) return res.status(429).json({ error: { message: 'Speech session limit reached. End the current microphone session or retry later.' } });
 limits.tickets++; const ticket = crypto.randomBytes(32).toString('hex');
 tickets.set(ticket, { workspace, session: session.id, expires: Date.now() + 30000 });
 res.json({ ticket, expires_in: 30 });
}));
export const speakHandler = asyncHandler(async (req: Request, res: Response) => {
 const workspace = workspaceId(req)!; const session = findConversation(workspace, req.params.id);
 if (!session) return res.status(404).json({ error: { message: 'Conversation not found.' } });
 if (process.env.VOICEAI_SPEECH_MODE !== 'cloud' || !config.apiKeys.cartesia) return res.status(503).json({ error: { message: 'Cartesia speech is not configured.' } });
 const text = req.body.text;
 if (typeof text !== 'string' || !text.trim() || text.length > 10000 || !(text === session.agent.greeting || session.history.some(message => message.role === 'assistant' && message.content === text))) return res.status(400).json({ error: { message: 'Only a saved conversation reply or greeting of at most 10000 characters can be spoken.' } });
 const limits = budget(workspace);
 const chunks = speechSegments(text); const index = req.body.chunk_index ?? 0;
 if (!Number.isInteger(index) || index < 0 || index >= chunks.length) return res.status(400).json({ error: { message: 'Invalid speech segment.' } });
 const spokenText = chunks[index];
 if (limits.speaking || limits.chars + spokenText.length > 6000) return res.status(429).json({ error: { message: 'Voice generation limit reached. Please retry later.' } });
 limits.chars += spokenText.length; limits.speaking = true;
 const abort = new AbortController(); const cancel = () => { if (!res.writableEnded) abort.abort(); }; res.on('close', cancel);
 try {
  const result = await axios.post('https://api.cartesia.ai/tts/bytes', { model_id: process.env.CARTESIA_MODEL || 'sonic-3.6', transcript: spokenText, voice: session.agent.voice_id, language: session.agent.default_language || 'en', output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 24000 } }, { headers: { Authorization: 'Bearer ' + config.apiKeys.cartesia, 'Cartesia-Version': '2026-08-14' }, responseType: 'arraybuffer', maxContentLength: 4000000, timeout: 20000, signal: abort.signal });
  res.set({ 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }).send(Buffer.from(result.data));
 } catch { if (!res.destroyed) res.status(502).json({ error: { message: 'Cartesia could not generate this voice. Check the selected Cartesia voice, credits and connection.' } }); }
 finally { limits.speaking = false; res.off('close', cancel); }
});
router.post('/:id/speak', speakHandler);
export default router;
const sockets = new WebSocketServer({ noServer: true, maxPayload: 256000 });
export function handleSpeechUpgrade(req: IncomingMessage, socket: any, head: Buffer): boolean {
 let url: URL; try { url = new URL(req.url || '/', 'http://localhost'); } catch { socket.destroy(); return true; }
 if (url.pathname !== '/speech') return false;
 const record = tickets.get(url.searchParams.get('ticket') || ''); tickets.delete(url.searchParams.get('ticket') || '');
 const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('voiceai_session='))?.slice('voiceai_session='.length);
 const account = accountForToken(cookie);
 let originValid = false; try { originValid = new URL(req.headers.origin || '').host === req.headers.host; } catch {}
 if (!record || !account || account.workspace_id !== record.workspace || record.expires < Date.now() || !originValid || process.env.VOICEAI_SPEECH_MODE !== 'cloud' || !config.apiKeys.deepgram || !findConversation(record.workspace, record.session) || (active.get(record.workspace) || 0) >= 1) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return true; }
 active.set(record.workspace, 1);
 let accepted = false; socket.once('close', () => { if (!accepted) active.delete(record.workspace); });
 sockets.handleUpgrade(req, socket, head, client => {
  accepted = true;
  const session = findConversation(record.workspace, record.session)!;
  const params = new URLSearchParams({ model: process.env.DEEPGRAM_MODEL || 'nova-3', language: session.agent.default_language || 'en', interim_results: 'true', smart_format: 'true', endpointing: '300' });
  const upstream = new WebSocket('wss://api.deepgram.com/v1/listen?' + params, { headers: { Authorization: 'Token ' + config.apiKeys.deepgram }, handshakeTimeout: 10000, maxPayload: 1000000 });
  let bytes = 0; let closed = false;
  const send = (data: object) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); };
  const finish = () => { if (closed) return; closed = true; clearTimeout(deadline); clearInterval(keepalive); active.delete(record.workspace); upstream.terminate(); client.close(); };
  const deadline = setTimeout(() => { send({ type: 'error', message: 'Five-minute speech limit reached. Resume to start a new session.' }); finish(); }, 300000);
  const keepalive = setInterval(() => { if (!findConversation(record.workspace, record.session)) { finish(); return; } if (upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ type: 'KeepAlive' })); }, 5000);
  upstream.on('open', () => send({ type: 'ready' }));
  upstream.on('message', data => { try { const message = JSON.parse(data.toString()); if (message.type === 'Results') send({ type: 'transcript', text: message.channel?.alternatives?.[0]?.transcript || '', final: !!message.is_final }); else if (message.type === 'Error') { send({ type: 'error', message: 'Deepgram could not transcribe this audio.' }); finish(); } } catch {} });
  upstream.on('error', () => { send({ type: 'error', message: 'Deepgram connection failed. Check credits, language and microphone format.' }); finish(); });
  upstream.on('close', finish); client.on('close', finish); client.on('error', finish);
  client.on('message', (data, binary) => { if (upstream.readyState !== WebSocket.OPEN) return; if (!binary) { if (data.toString() === 'finalize') upstream.send(JSON.stringify({ type: 'Finalize' })); return; } bytes += Buffer.byteLength(data as Buffer); if (bytes > 12000000 || upstream.bufferedAmount > 1000000) { send({ type: 'error', message: 'Microphone stream exceeded its limit.' }); finish(); return; } upstream.send(data, { binary: true }); });
 });
 return true;
}
