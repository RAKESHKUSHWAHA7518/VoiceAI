import { agentSchema } from '../models/agent.model';
import fs from 'fs';
import { z } from 'zod';
import { dataPath } from '../config/storage';
import { MongoRecordModel } from '../models/base';
import { PersistentStore } from './database';

const message = z.object({ role: z.enum(['user', 'assistant']), text: z.string(), timestamp: z.number() });
export const toolEventSchema = z.object({ name: z.string(), status: z.enum(['completed', 'error']), result: z.string(), timestamp: z.number() });
const duration = z.number().finite().min(0).max(180000);
export const voiceTimingSchema = z.object({ turn_id: z.string().uuid(), first_text_ms: duration.optional(), first_audio_ms: duration, transcript_wait_ms: duration.optional(), speech_to_audio_ms: duration.optional(), audio_clock: z.enum(['scheduled_pcm', 'media_element']) }).strict();
const schema = z.object({ voice_timings: z.array(voiceTimingSchema).max(100).optional(), channel: z.enum(['playground', 'widget']).optional(), deployment_id: z.string().optional(), version_id: z.string().optional(), origin: z.string().optional(), id: z.string(), workspace_id: z.string(), agent_id: z.string(), agent_name: z.string(), started_at: z.number(), updated_at: z.number(), status: z.enum(['active', 'ended']), runtime_mode: z.enum(['demo', 'live']), turn_outcomes: z.array(z.object({ id: z.string(), input: z.string(), output: z.string(), status: z.enum(['completed', 'interrupted', 'error']), timing: z.object({ retrieval_ms: duration, model_first_text_ms: duration.nullable(), first_speech_segment_ms: duration.nullable() }).optional(), timestamp: z.number(), tool_events: z.array(toolEventSchema) })).optional(), configuration: agentSchema.optional(), sources: z.array(z.object({ doc_id: z.string(), title: z.string() })).optional(), tool_events: z.array(toolEventSchema).optional(), messages: z.array(message), processing_ms: z.number().nullable() });
export type ConversationRecord = z.infer<typeof schema>;
const file = dataPath('conversation_history.json');
let records: ConversationRecord[] = fs.existsSync(file) ? z.array(schema).parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : [];
const store = new PersistentStore(new MongoRecordModel<ConversationRecord>('conversation_history', schema, [{ key: { 'value.workspace_id': 1, 'value.updated_at': -1 }, name: 'workspace_history' }]), file, () => records, values => { records = values; });
let pending: Promise<unknown> = Promise.resolve();
export function saveConversationRecord(record: ConversationRecord) {
  const snapshot = structuredClone(record);
  const result = pending.then(async () => {
    const previous = records;
    records = [...records.filter(value => value.id !== snapshot.id), schema.parse({ ...snapshot, voice_timings: records.find(value => value.id === snapshot.id)?.voice_timings || snapshot.voice_timings })];
    try { await store.save(); } catch (error) { records = previous; throw error; }
  });
  pending = result.catch(() => undefined); return result;
}
export function historyForWorkspace(workspace: string) {
  return records.filter(record => record.workspace_id === workspace).sort((a, b) => b.updated_at - a.updated_at).map(record => ({ ...record, configuration: undefined, tool_events: undefined, turn_outcomes: undefined, sources: undefined, messages: undefined, message_count: record.messages.length, preview: record.messages.find(message => message.role === 'user')?.text || record.turn_outcomes?.[0]?.input || '' }));
}
export function historyRecord(workspace: string, id: string) { return records.find(record => record.id === id && record.workspace_id === workspace); }
export function pagedHistory(workspace: string, requestedPage: number, pageSize: number, query = '') {
  const workspaceRecords = records.filter(record => record.workspace_id === workspace);
  const search = query.trim().toLowerCase();
  const matching = workspaceRecords.filter(record => !search || [record.id, record.agent_id, record.agent_name, ...record.messages.map(message => message.text), ...(record.turn_outcomes || []).map(turn => turn.input)].some(value => value.toLowerCase().includes(search)))
    .sort((a, b) => b.updated_at - a.updated_at || a.id.localeCompare(b.id));
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize)); const page = Math.min(requestedPage, totalPages);
  const conversations = matching.slice((page - 1) * pageSize, page * pageSize).map(record => ({ id: record.id, agent_id: record.agent_id, agent_name: record.agent_name, started_at: record.started_at, updated_at: record.updated_at, status: record.status, runtime_mode: record.runtime_mode, channel: record.channel, message_count: record.messages.length, processing_ms: record.processing_ms, preview: record.messages.find(message => message.role === 'user')?.text || record.turn_outcomes?.[0]?.input || '' }));
  return { conversations, pagination: { page, page_size: pageSize, total: matching.length, total_pages: totalPages }, stats: { conversation_count: workspaceRecords.length, message_count: workspaceRecords.reduce((total, record) => total + record.messages.length, 0) } };
}

export function saveVoiceTiming(workspace: string, id: string, timing: z.infer<typeof voiceTimingSchema>) {
  const result = pending.then(async () => {
    const record = records.find(value => value.id === id && value.workspace_id === workspace);
    if (!record?.turn_outcomes?.some(turn => turn.id === timing.turn_id && turn.status === 'completed')) return false;
    if (record.voice_timings?.some(value => value.turn_id === timing.turn_id)) return true;
    if ((record.voice_timings?.length || 0) >= 100) return false;
    const previous = records;
    records = records.map(value => value === record ? { ...record, voice_timings: [...(record.voice_timings || []), timing] } : value);
    try { await store.save(); } catch (error) { records = previous; throw error; }
    return true;
  });
  pending = result.catch(() => undefined); return result;
}
