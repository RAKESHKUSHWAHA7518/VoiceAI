import { z } from 'zod';
import { MongoRecordModel, recordId, count } from './base';

export const phoneNumberSchema = z.object({
  id: recordId,
  phone_number: z.string().min(1),
  friendly_name: z.string(),
  agent_id: recordId,
  agent_name: z.string(),
  agent_avatar: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  inbound_calls_count: count,
  last_call_at: z.number().nonnegative().optional(),
  created_at: z.number().nonnegative(),
}).passthrough();

export type PhoneNumberRecord = z.infer<typeof phoneNumberSchema>;
export const PhoneNumberModel = new MongoRecordModel<PhoneNumberRecord>('phone_numbers', phoneNumberSchema, [
  { key: { 'value.phone_number': 1 }, name: 'phone_number_lookup' },
]);
