import express, { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/errorHandler';
import { workspaceId } from '../middleware/workspace';
import { findConversation } from '../services/conversations';
import { cloudinaryReady, uploadMedia, mediaDownload } from '../services/cloudinary_media';
import { recordingFor, saveRecording, recordingUsage, removeRecording, cleanupRecordings, cleanupFailedRecording } from '../services/recordings';
import logger from '../utils/logger';

export const recordingBody = express.raw({ type: ['audio/webm', 'audio/ogg', 'audio/mp4'], limit: '12mb' });
const active = new Set<string>();
const retention = setInterval(() => { void cleanupRecordings().catch(() => logger.error('Recording retention cleanup failed')); }, 3600000); retention.unref();
export const startRecording = asyncHandler(async (req: Request, res: Response) => {
  const workspace = workspaceId(req)!; const session = findConversation(workspace, req.params.id);
  if (!session?.archive) return res.status(404).json({ error: { message: 'Saved conversation not found.' } });
  if (!cloudinaryReady()) return res.status(503).json({ error: { message: 'Recording storage is not configured.' } });
  if (req.body.notice_version !== 'recording-v1') return res.status(400).json({ error: { message: 'Acknowledge the recording notice before starting.' } });
  const previous = recordingFor(workspace, session.id);
  if (previous) return res.status(409).json({ error: { message: 'This conversation already has a recording. Start a new conversation.' } });
  await cleanupRecordings();
  if (recordingUsage(workspace) >= 100000000 || recordingUsage() >= 500000000) return res.status(429).json({ error: { message: 'Demo recording storage is full. Delete old recordings first.' } });
  await saveRecording({ id: session.id, workspace_id: workspace, status: 'pending', notice_version: 'recording-v1', acknowledged_at: Date.now(), expires_at: Date.now() + 30 * 86400000 });
  res.status(201).json({ success: true, max_bytes: 12000000, max_seconds: 300 });
});
export const uploadRecording = asyncHandler(async (req: Request, res: Response) => {
  const workspace = workspaceId(req)!; const record = recordingFor(workspace, req.params.id);
  if (!record || record.expires_at < Date.now()) return res.status(404).json({ error: { message: 'Recording not found.' } });
  if (record.status === 'ready') return res.json({ success: true });
  if (active.has(record.id) || active.size >= 3) return res.status(429).json({ error: { message: 'Recording upload is busy. Retry shortly.' } });
  const bytes = req.body as Buffer;
  const validMagic = Buffer.isBuffer(bytes) && (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) || bytes.subarray(0, 4).toString() === 'OggS' || bytes.subarray(4, 8).toString() === 'ftyp');
  if (!validMagic || bytes.length < 32 || bytes.length > 12000000) return res.status(400).json({ error: { message: 'Unsupported or empty audio recording.' } });
  // Reserve the full upload capacity for each in-flight recording.
  if (recordingUsage(workspace) + bytes.length + active.size * 12000000 > 100000000 || recordingUsage() + bytes.length + active.size * 12000000 > 500000000) return res.status(429).json({ error: { message: 'Demo recording storage quota reached.' } });
  active.add(record.id);
  let uploaded: Awaited<ReturnType<typeof uploadMedia>> | undefined;
  const publicId = `voiceai/recordings/${crypto.createHash('sha256').update(workspace).digest('hex').slice(0, 20)}/${record.id}`;
  let uploadStarted = false;
  try {
    if (['cleanup_pending', 'uploading'].includes(record.status)) await cleanupFailedRecording(workspace, record.id);
    // Persist the deterministic asset ID BEFORE the remote side effect, including ambiguous network failures.
    await saveRecording({ ...record, status: 'uploading', public_id: publicId, bytes: bytes.length, upload_started_at: Date.now() });
    uploadStarted = true;
    uploaded = await uploadMedia(bytes, publicId, 'audio');
    if (uploaded.duration > 305 || uploaded.bytes > 12000000) throw new Error('Recording exceeds demo limits');
    await saveRecording({ ...record, status: 'ready', ...uploaded });
    res.status(201).json({ success: true });
  } catch {
    if (uploadStarted) {
      // If deletion or this save fails, the earlier durable uploading record still retains the asset ID.
      try {
        await saveRecording({ ...record, ...uploaded, status: 'cleanup_pending', public_id: uploaded?.public_id || publicId, bytes: uploaded?.bytes || bytes.length });
        await cleanupFailedRecording(workspace, record.id);
      } catch { logger.error('Recording cleanup queued for retry', { session_id: record.id }); }
    }
    res.status(502).json({ error: { message: 'Recording could not be stored. Keep this window open and retry saving.' } });
  } finally { active.delete(record.id); }
});
export const playRecording = asyncHandler(async (req: Request, res: Response) => {
  const value = recordingFor(workspaceId(req)!, req.params.id);
  if (value?.status !== 'ready' || !value.public_id || !value.format || value.expires_at < Date.now()) return res.status(404).json({ error: { message: 'Recording is unavailable.' } });
  const result = await axios.get(mediaDownload(value.public_id, value.format), { responseType: 'arraybuffer', maxContentLength: 12000000, timeout: 30000 });
  // Proxy private media: no permanent Cloudinary delivery link is exposed.
  res.set({ 'Content-Type': String(result.headers['content-type'] || 'application/octet-stream'), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(Buffer.from(result.data));
});
export const deleteRecording = asyncHandler(async (req: Request, res: Response) => {
  if (active.has(req.params.id)) return res.status(409).json({ error: { message: 'Wait for the recording upload to finish.' } });
  await removeRecording(workspaceId(req)!, req.params.id); res.json({ success: true });
});
