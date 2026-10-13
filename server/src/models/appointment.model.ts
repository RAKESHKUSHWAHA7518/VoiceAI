import { z } from 'zod';
import { MongoRecordModel, recordId } from './base';

export const appointmentSchema = z.object({
  id: recordId,
  customer_name: z.string(),
  customer_phone: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(1),
  service: z.string(),
  status: z.enum(['confirmed', 'rescheduled', 'cancelled']),
  notes: z.string().optional(),
  agent_id: z.string().optional(),
  created_at: z.string().datetime(),
}).passthrough();

export type AppointmentRecord = z.infer<typeof appointmentSchema>;
export const AppointmentModel = new MongoRecordModel<AppointmentRecord>('appointments', appointmentSchema, [
  { key: { 'value.date': 1, 'value.status': 1 }, name: 'appointments_by_date' },
]);
