import { z } from 'zod';
import { MongoRecordModel, recordId } from './base';

export const voiceSchema = z.object({
  id: recordId,
  name: z.string().min(1),
  provider: z.enum(['cartesia', 'elevenlabs', 'openai', 'custom_clone']),
  gender: z.enum(['Female', 'Male', 'Neutral']),
  accent: z.string(),
  tone: z.string(),
  description: z.string(),
  sample_text: z.string(),
  is_cloned: z.boolean().optional(),
  sample_audio_base64: z.string().optional(),
  created_at: z.string().datetime().optional(),
}).passthrough();

export type VoiceProfile = z.infer<typeof voiceSchema>;
export const VoiceModel = new MongoRecordModel<VoiceProfile>('custom_voices', voiceSchema);
