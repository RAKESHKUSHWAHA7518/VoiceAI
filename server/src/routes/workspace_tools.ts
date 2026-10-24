import { registerConversationFixtures } from '../services/conversation_tools';
import { Router, Request, Response } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import { dataPath } from '../config/storage';
import { MongoRecordModel } from '../models/base';
import { PersistentStore } from '../services/database';
import { workspaceId } from '../middleware/workspace';
import { ownsAgent, getAgentById } from './agents';
import { asyncHandler } from '../middleware/errorHandler';
import { workspaceSessions } from '../services/conversations';
import { historyForWorkspace } from '../services/conversation_history';

const kinds = z.enum(['phone', 'tool', 'appointment']);
const fields = z.object({ kind: kinds, name: z.string().trim().min(1).max(120), agent_id: z.string().min(1).max(100), value: z.string().max(8000).default(''), notes: z.string().max(4000).default('') });
const schema = fields.extend({ value: z.string(), notes: z.string(), id: z.string(), workspace_id: z.string(), created_at: z.number() });
type Record = z.infer<typeof schema>;
const file = dataPath('workspace_tools.json');
let records: Record[] = fs.existsSync(file) ? z.array(schema).parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : [];
registerConversationFixtures(() => records);
const store = new PersistentStore(new MongoRecordModel<Record>('workspace_tools', schema), file, () => records, value => { records = value; });
let pending: Promise<unknown> = Promise.resolve();
function mutate(operation: () => void) {
  const task = pending.then(async () => { const previous = records; operation(); try { await store.save(); } catch (error) { records = previous; throw error; } });
  pending = task.catch(() => undefined); return task;
}
const router = Router();
router.get('/monitor', (req, res) => res.json({ success: true, sessions: workspaceSessions(workspaceId(req)!), history: historyForWorkspace(workspaceId(req)!), audio_metrics_available: false }));
router.get('/', (req, res) => res.json({ success: true, records: records.filter(value => value.workspace_id === workspaceId(req)) }));
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = fields.parse(req.body);
  if (data.kind !== 'tool') return res.status(400).json({ success: false, error: { message: 'Use the phone registry or calendar to create these records.' } });
  if (!ownsAgent(req, data.agent_id)) return res.status(404).json({ success: false, error: { message: 'Agent not found' } });
  if (data.kind === 'tool') { try { JSON.parse(data.value); } catch { return res.status(400).json({ success: false, error: { message: 'Mock tool response must be valid JSON.' } }); } }
  const record = { ...data, id: crypto.randomUUID(), workspace_id: workspaceId(req)!, created_at: Date.now() };
  await mutate(() => { if (records.filter(value => value.workspace_id === record.workspace_id).length >= 200) throw new Error('Workspace record limit reached'); records = [...records, record]; });
  res.status(201).json({ success: true, record });
}));
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!records.some(value => value.id === req.params.id && value.workspace_id === workspaceId(req))) return res.status(404).json({ success: false, error: { message: 'Record not found' } });
  await mutate(() => { records = records.filter(value => value.id !== req.params.id || value.workspace_id !== workspaceId(req)); });
  res.json({ success: true });
}));
router.post('/:id/test', (req, res) => {
  const record = records.find(value => value.id === req.params.id && value.workspace_id === workspaceId(req) && value.kind === 'tool');
  if (!record) return res.status(404).json({ success: false, error: { message: 'Tool not found' } });
  return res.json({ success: true, mode: 'mock', result: JSON.parse(record.value), external_request: false });
});
export default router;

export const privatePhoneRouter = Router();
privatePhoneRouter.get('/numbers', (req, res) => res.json({ success: true, twilio_configured: false, mode: 'simulation', numbers: records.filter(value => value.workspace_id === workspaceId(req) && value.kind === 'phone').map(value => JSON.parse(value.value)) }));
privatePhoneRouter.post('/numbers', asyncHandler(async (req: Request, res: Response) => {
  const input = z.object({ phone_number: z.string().min(5).max(40), friendly_name: z.string().max(120).default('Test line'), agent_id: z.string() }).parse(req.body);
  if (!ownsAgent(req, input.agent_id)) return res.status(404).json({ success: false, error: 'Agent not found' });
  const agent = getAgentById(input.agent_id)!;
  const number = { ...input, id: crypto.randomUUID(), agent_name: agent.name, agent_avatar: agent.avatar, status: 'inactive', inbound_calls_count: 0, created_at: Date.now() };
  await mutate(() => { records = [...records, { id: number.id, workspace_id: workspaceId(req)!, kind: 'phone', name: input.friendly_name, agent_id: agent.id, value: JSON.stringify(number), notes: 'Local registry only. Number ownership and carrier provisioning are not verified.', created_at: number.created_at }]; });
  res.status(201).json({ success: true, number, mode: 'simulation' });
}));
privatePhoneRouter.put('/numbers/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = records.find(value => value.id === req.params.id && value.workspace_id === workspaceId(req) && value.kind === 'phone');
  if (!found) return res.status(404).json({ success: false, error: 'Number not found' });
  const input = z.object({ agent_id: z.string().optional(), friendly_name: z.string().max(120).optional(), status: z.enum(['active', 'inactive']).optional() }).parse(req.body);
  const agent = getAgentById(input.agent_id || found.agent_id);
  if (!agent || !ownsAgent(req, agent.id)) return res.status(404).json({ success: false, error: 'Agent not found' });
  const number = { ...JSON.parse(found.value), ...input, agent_id: agent.id, agent_name: agent.name, agent_avatar: agent.avatar };
  await mutate(() => { records = records.map(value => value.id === found.id ? { ...value, agent_id: agent.id, value: JSON.stringify(number) } : value); });
  res.json({ success: true, number, mode: 'simulation' });
}));
privatePhoneRouter.delete('/numbers/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = records.find(value => value.id === req.params.id && value.workspace_id === workspaceId(req) && value.kind === 'phone');
  if (!found) return res.status(404).json({ success: false, error: 'Number not found' });
  await mutate(() => { records = records.filter(value => value.id !== found.id || value.workspace_id !== workspaceId(req)); }); res.json({ success: true });
}));
privatePhoneRouter.post('/outbound', (req, res) => res.json({ success: true, mode: 'simulation', call_sid: `DEMO_${crypto.randomUUID()}`, status: 'simulated', to: String(req.body.to_phone_number || '').slice(0, 40) }));
privatePhoneRouter.post('/simulate-inbound', (req, res) => res.json({ success: true, mode: 'simulation', call_sid: `DEMO_${crypto.randomUUID()}`, stream_url: 'Simulation only — no carrier or audio stream', caller_number: String(req.body.caller_number || '').slice(0, 40) }));
privatePhoneRouter.post('/softphone/dial', (req, res) => res.json({ success: true, mode: 'simulation', session: { call_sid: `DEMO_${crypto.randomUUID()}`, to_number: String(req.body.to_number || '').slice(0, 40), status: 'simulated' }, twiml: '<!-- Local simulation: no carrier request made. -->' }));
privatePhoneRouter.post('/softphone/dtmf', (_req, res) => res.json({ success: true, mode: 'simulation' }));
privatePhoneRouter.post('/softphone/hangup', (_req, res) => res.json({ success: true, mode: 'simulation' }));

export const privateCalendarRouter = Router();
const slots = ['09:00 AM', '10:30 AM', '11:30 AM', '01:30 PM', '02:30 PM', '03:45 PM', '04:30 PM'];
function dateValue(input: unknown) {
  if (input === 'today' || input == null) return new Date().toISOString().slice(0, 10);
  if (input === 'tomorrow') return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input);
}
privateCalendarRouter.get('/appointments', (req, res) => res.json({ success: true, appointments: records.filter(value => value.workspace_id === workspaceId(req) && value.kind === 'appointment').map(value => JSON.parse(value.value)) }));
privateCalendarRouter.get('/slots', asyncHandler(async (req: Request, res: Response) => {
  const date = dateValue(req.query.date);
  const taken = records.filter(value => value.workspace_id === workspaceId(req) && value.kind === 'appointment').map(value => JSON.parse(value.value)).filter(value => value.date === date);
  res.json({ success: true, date, slots: slots.filter(slot => !taken.some(value => value.time === slot)) });
}));
privateCalendarRouter.post('/book', asyncHandler(async (req: Request, res: Response) => {
  const input = z.object({ customer_name: z.string().trim().min(1).max(120), customer_phone: z.string().max(40).default(''), time: z.enum(slots as [string, ...string[]]), service: z.string().max(120).default('Consultation'), notes: z.string().max(4000).default('') }).parse(req.body);
  const date = dateValue(req.body.date);
  const appointment = { ...input, date, id: crypto.randomUUID(), status: 'confirmed', created_at: new Date().toISOString() };
  let conflict = false;
  await mutate(() => {
    if (records.some(value => value.kind === 'appointment' && value.workspace_id === workspaceId(req) && JSON.parse(value.value).date === date && JSON.parse(value.value).time === input.time)) { conflict = true; return; }
    records = [...records, { id: appointment.id, workspace_id: workspaceId(req)!, kind: 'appointment', name: input.customer_name, agent_id: 'manual', value: JSON.stringify(appointment), notes: input.notes, created_at: Date.now() }];
  });
  if (conflict) return res.status(409).json({ success: false, error: 'This slot was already booked. Refresh and choose another slot.' });
  res.status(201).json({ success: true, appointment });
}));
privateCalendarRouter.delete('/appointments/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = records.find(value => value.id === req.params.id && value.workspace_id === workspaceId(req) && value.kind === 'appointment');
  if (!found) return res.status(404).json({ success: false, error: 'Appointment not found' });
  await mutate(() => { records = records.filter(value => value.id !== found.id || value.workspace_id !== workspaceId(req)); }); res.json({ success: true });
}));

