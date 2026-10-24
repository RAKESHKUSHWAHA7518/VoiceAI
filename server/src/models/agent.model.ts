import { z } from 'zod';
import { MongoRecordModel, recordId } from './base';

export const agentSchema = z.object({
  id: recordId,
  workspace_id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  role: z.string().max(200),
  avatar: z.string().max(100),
  voice_id: z.string().min(1),
  voice_name: z.string().optional(),
  llm_model: z.string().min(1),
  llm_temperature: z.number().min(0).max(2),
  system_prompt: z.string().max(30000),
  assigned_tools: z.array(z.string().min(1)).max(100),
  greeting: z.string().max(2000),
  is_default: z.boolean().optional(),
  languages_supported: z.array(z.string().min(1)).min(1).optional(),
  default_language: z.string().min(1).optional(),
  auto_switch_language: z.boolean().optional(),
});

export type AgentRecord = z.infer<typeof agentSchema>;
export const AgentRecordModel = new MongoRecordModel<AgentRecord>('agents', agentSchema);
