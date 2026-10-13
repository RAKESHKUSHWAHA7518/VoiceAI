import { z } from 'zod';
import { MongoRecordModel, recordId, count } from './base';

export const knowledgeDocumentSchema = z.object({
  id: recordId,
  agent_id: recordId,
  title: z.string(),
  filename: z.string(),
  file_type: z.enum(['pdf', 'md', 'txt', 'json', 'csv']),
  file_size: count,
  created_at: z.number().nonnegative(),
  chunk_count: count,
  status: z.enum(['indexed', 'indexing', 'error']),
  error: z.string().optional(),
}).passthrough();

export type DocumentRecord = z.infer<typeof knowledgeDocumentSchema>;
export const KnowledgeDocumentModel = new MongoRecordModel<DocumentRecord>('knowledge_documents', knowledgeDocumentSchema, [
  { key: { 'value.agent_id': 1 }, name: 'documents_by_agent' },
]);
