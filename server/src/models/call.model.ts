import { z } from 'zod';
import { MongoRecordModel, recordId, count } from './base';

const score = z.number().min(0).max(100);
export const callQASchema = z.object({
  overall_score: score, empathy: score, clarity: score, tool_accuracy: score, response_speed: score,
});
export const callSchema = z.object({
  id: recordId,
  session_id: recordId,
  agent_id: recordId,
  agent_name: z.string(),
  agent_avatar: z.string().optional(),
  agent_role: z.string(),
  timestamp: z.number().nonnegative(),
  duration_seconds: z.number().nonnegative(),
  summary: z.string(),
  sentiment: z.enum(['Positive', 'Neutral', 'Frustrated', 'Curious']),
  sentiment_score: score,
  resolution_status: z.enum(['Resolved', 'Needs Follow-Up', 'Escalated', 'Unresolved']),
  topics: z.array(z.string()),
  action_items: z.array(z.string()),
  qa_scores: callQASchema,
  transcripts: z.array(z.object({
    role: z.string(), text: z.string(), timestamp: z.union([z.string(), z.number()]).optional(),
  }).passthrough()),
  tool_calls_count: count,
  audio_url: z.string().optional(),
}).passthrough();

export type CallQAscore = z.infer<typeof callQASchema>;
export type CallAnalyticsRecord = z.infer<typeof callSchema>;
export const CallModel = new MongoRecordModel<CallAnalyticsRecord>('calls', callSchema, [
  { key: { 'value.agent_id': 1, 'value.timestamp': -1 }, name: 'agent_call_history' },
]);
