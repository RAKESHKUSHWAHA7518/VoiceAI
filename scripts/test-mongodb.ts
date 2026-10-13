import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import config from '../server/src/config';
import {
  MongoRecordModel, StoredRecord, CallModel, AppointmentModel, PhoneNumberModel,
  VoiceModel, KnowledgeDocumentModel, KnowledgeChunkModel,
} from '../server/src/models';

// A common audit view keeps each model's complete runtime schema intact.
function auditModel<T extends { id: string }>(model: MongoRecordModel<T>): MongoRecordModel<{ id: string }> {
  return new MongoRecordModel<{ id: string }>(model.collectionName, model.schema, model.indexes);
}

async function main() {
  if (!config.mongodb.uri) throw new Error('MONGODB_URI is missing');
  const options = { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, timeoutMS: 15000 };
  const client = new MongoClient(config.mongodb.uri, options);
  const reader = new MongoClient(config.mongodb.uri, options);
  const databaseName = config.mongodb.database || decodeURIComponent(new URL(config.mongodb.uri).pathname.slice(1)) || 'voiceai';
  const models: MongoRecordModel<{ id: string }>[] = [
    auditModel(CallModel), auditModel(AppointmentModel), auditModel(PhoneNumberModel),
    auditModel(VoiceModel), auditModel(KnowledgeDocumentModel), auditModel(KnowledgeChunkModel),
  ];
  const records = new Map<string, Map<string, StoredRecord<{ id: string }>>>();
  const now = Date.now();
  const fixtures = [
    { session_id: 'database_test', agent_id: 'database_test', agent_name: 'Database Test', agent_role: 'Test',
      timestamp: now, duration_seconds: 0, summary: 'Temporary database verification', sentiment: 'Neutral',
      sentiment_score: 50, resolution_status: 'Resolved', topics: [], action_items: [],
      qa_scores: { overall_score: 100, empathy: 100, clarity: 100, tool_accuracy: 100, response_speed: 100 },
      transcripts: [], tool_calls_count: 0 },
    { customer_name: 'Database Test', customer_phone: '', date: '2099-01-01', time: '09:00 AM', service: 'Test',
      status: 'cancelled', created_at: new Date(now).toISOString() },
    { phone_number: 'database-test', friendly_name: 'Database Test', agent_id: 'database_test', agent_name: 'Database Test',
      status: 'inactive', inbound_calls_count: 0, created_at: now },
    { name: 'Database Test', provider: 'custom_clone', gender: 'Neutral', accent: 'Test', tone: 'Test',
      description: 'Temporary verification record', sample_text: '', is_cloned: true, created_at: new Date(now).toISOString() },
    { agent_id: 'database_test', title: 'Database Test', filename: 'test.txt', file_type: 'txt', file_size: 4,
      created_at: now, chunk_count: 1, status: 'indexed' },
    { doc_id: 'database_test', agent_id: 'database_test', chunk_index: 0, text: 'test',
      metadata: { title: 'Database Test', filename: 'test.txt', token_count: 1 } },
  ];
  const testIds = models.map(() => `db_verify_${randomUUID()}`);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await reader.connect();
    const db = client.db(databaseName);
    const readDb = reader.db(databaseName);
    await db.command({ ping: 1 });
    console.log(`PASS Atlas connection: ${databaseName}`);

    for (const model of models) {
      const collection = model.collection(db);
      const byId = new Map<string, StoredRecord<{ id: string }>>();
      for await (const record of collection.find()) {
        const value = model.fromDocument(record);
        assert(!byId.has(value.id), `${model.collectionName}: duplicate ID`);
        byId.set(value.id, record);
      }
      records.set(model.collectionName, byId);
      const indexes = await collection.listIndexes().toArray();
      const expected = [{ name: 'record_position', key: { position: 1 } }, ...model.indexes];
      for (const index of expected) {
        assert(indexes.some(actual => actual.name === index.name && JSON.stringify(actual.key) === JSON.stringify(index.key)),
          `${model.collectionName}: missing index ${index.name}`);
      }
      assert(await db.collection('_migrations').findOne({ _id: model.collectionName } as never),
        `${model.collectionName}: missing migration marker`);
      console.log(`PASS ${model.collectionName}: ${byId.size} records valid; indexes and migration marker present`);
    }

    const documents = records.get('knowledge_documents')!;
    const chunks = records.get('knowledge_chunks')!;
    const chunkCounts = new Map<string, number>();
    const chunkPositions = new Set<string>();
    for (const record of chunks.values()) {
      const chunk = KnowledgeChunkModel.parse(record.value);
      const document = documents.get(chunk.doc_id);
      assert(document, 'Knowledge chunk references a missing document');
      assert.equal(KnowledgeDocumentModel.parse(document.value).agent_id, chunk.agent_id, 'Knowledge agent mismatch');
      const key = `${chunk.doc_id}:${chunk.chunk_index}`;
      assert(!chunkPositions.has(key), 'Duplicate knowledge chunk index');
      chunkPositions.add(key);
      chunkCounts.set(chunk.doc_id, (chunkCounts.get(chunk.doc_id) || 0) + 1);
    }
    for (const record of documents.values()) {
      const document = KnowledgeDocumentModel.parse(record.value);
      assert.equal(chunkCounts.get(document.id) || 0, document.chunk_count, 'Knowledge document chunk count mismatch');
    }
    console.log('PASS knowledge document/chunk relationships and counts');

    for (const [index, model] of models.entries()) {
      const collection = model.collection(db);
      const readCollection = model.collection(readDb);
      const id = testIds[index];
      const value = { ...fixtures[index], id };
      const document = model.toDocument(value, 2147483647);
      await collection.insertOne(document);
      const inserted = await readCollection.findOne({ _id: id });
      assert(inserted, `${model.collectionName}: inserted record not readable`);
      assert.deepEqual(model.fromDocument(inserted), model.parse(value));

      const updated = model.toDocument({ ...value, verification_marker: 'updated' }, 2147483647);
      const replacement = await collection.replaceOne({ _id: id }, updated);
      assert.equal(replacement.modifiedCount, 1);
      const loaded = await readCollection.findOne({ _id: id });
      assert(loaded);
      assert.deepEqual(model.fromDocument(loaded), model.parse(updated.value));
      const deleted = await collection.deleteOne({ _id: id });
      assert.equal(deleted.deletedCount, 1);
      assert.equal(await readCollection.findOne({ _id: id }), null);
      console.log(`PASS ${model.collectionName}: create/read/update/delete through models and independent connection`);
    }
  } finally {
    try {
      if (connected) {
        for (const [index, model] of models.entries()) {
          // Only remove this run's exact temporary ID, even if a previous assertion failed.
          await model.collection(client.db(databaseName)).deleteOne({ _id: testIds[index] });
        }
        console.log('Temporary verification records cleaned up');
      }
    } finally {
      await Promise.allSettled([reader.close(), client.close()]);
    }
  }
}

void main().catch(error => {
  // Print the class/code only; driver and schema errors can contain sensitive data.
  console.error(`FAIL database verification (${error.name || 'Error'}${error.code ? `, code ${error.code}` : ''})`);
  if (error.name === 'AssertionError') console.error(error.message.split('\n')[0]);
  process.exitCode = 1;
});
