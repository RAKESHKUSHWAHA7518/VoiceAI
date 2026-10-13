import { z } from 'zod';
import { MongoRecordModel, recordId, count } from './base';

export const knowledgeChunkSchema = z.object({
  id: recordId,
  doc_id: recordId,
  agent_id: recordId,
  chunk_index: count,
  text: z.string(),
  metadata: z.object({ title: z.string(), filename: z.string(), token_count: count }).passthrough(),
  term_frequencies: z.record(z.number().nonnegative()).optional(),
  magnitude: z.number().nonnegative().optional(),
}).passthrough();

export type DocumentChunk = z.infer<typeof knowledgeChunkSchema>;
export const KnowledgeChunkModel = new MongoRecordModel<DocumentChunk>('knowledge_chunks', knowledgeChunkSchema, [
  { key: { 'value.doc_id': 1, 'value.chunk_index': 1 }, name: 'chunks_by_document' },
]);
