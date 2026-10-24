import fs from 'fs';
import { z } from 'zod';
import { dataPath } from '../config/storage';
import { MongoRecordModel } from '../models/base';
import { PersistentStore } from './database';
import { deleteMedia } from './cloudinary_media';

const schema = z.object({ id: z.string(), workspace_id: z.string(), status: z.enum(['pending', 'uploading', 'ready', 'failed', 'cleanup_pending']), upload_started_at: z.number().optional(), notice_version: z.literal('recording-v1'), acknowledged_at: z.number(), expires_at: z.number(), public_id: z.string().optional(), format: z.string().optional(), bytes: z.number().optional(), duration: z.number().optional() });
export type Recording = z.infer<typeof schema>;
const file = dataPath('recordings.json');
let records: Recording[] = fs.existsSync(file) ? z.array(schema).parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : [];
const store = new PersistentStore(new MongoRecordModel<Recording>('recordings', schema), file, () => records, values => { records = values; });
let pending = Promise.resolve();
export const recordingFor = (workspace: string, id: string) => records.find(value => value.id === id && value.workspace_id === workspace);
export function recordingSummary(workspace: string, id: string) {
  const value = recordingFor(workspace, id);
  return value ? { status: value.expires_at < Date.now() ? 'expired' : value.status, duration: value.duration, bytes: value.bytes, expires_at: value.expires_at } : null;
}
export function recordingUsage(workspace?: string) { return records.filter(value => !workspace || value.workspace_id === workspace).reduce((total, value) => total + (value.bytes || 0), 0); }
export function saveRecording(record: Recording) {
  const snapshot = schema.parse(record);
  const job = pending.then(async () => { const old = records; records = [...records.filter(value => value.id !== snapshot.id), snapshot]; try { await store.save(); } catch (error) { records = old; throw error; } });
  pending = job.catch(() => {}); return job;
}
export async function removeRecording(workspace: string, id: string) {
  const value = recordingFor(workspace, id); if (!value) return;
  if (value.public_id) await deleteMedia(value.public_id);
  const job = pending.then(async () => { const old = records; records = records.filter(item => item.id !== id || item.workspace_id !== workspace); try { await store.save(); } catch (error) { records = old; throw error; } });
  pending = job.catch(() => {}); await job;
}
const cleaning = new Map<string, Promise<void>>();
export function cleanupFailedRecording(workspace: string, id: string): Promise<void> {
  const existing = cleaning.get(id); if (existing) return existing;
  const job = (async () => {
    const value = recordingFor(workspace, id);
    if (!value || !['cleanup_pending', 'uploading'].includes(value.status)) return;
    if (value.public_id) await deleteMedia(value.public_id);
    await saveRecording({ ...value, status: 'failed', public_id: undefined, format: undefined, bytes: undefined, duration: undefined, upload_started_at: undefined });
  })().finally(() => cleaning.delete(id));
  cleaning.set(id, job); return job;
}
export async function cleanupRecordings() {
  let failure: unknown;
  for (const value of [...records]) {
    try {
      if (value.expires_at < Date.now()) await removeRecording(value.workspace_id, value.id);
      else if (value.status === 'cleanup_pending' || (value.status === 'uploading' && (value.upload_started_at || 0) < Date.now() - 600000)) await cleanupFailedRecording(value.workspace_id, value.id);
    } catch (error) { failure = error; }
  }
  if (failure) throw failure;
}
