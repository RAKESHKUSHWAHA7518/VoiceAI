import { MongoClient, Db, AnyBulkWriteOperation } from 'mongodb';
import fs from 'fs';
import config from '../config';
import { MongoRecordModel, StoredRecord } from '../models/base';

type RecordData = { id: string };
let client: MongoClient | undefined;
let database: Db | undefined;
const stores: PersistentStore<RecordData>[] = [];

export function isMongoEnabled(): boolean {
  return !!config.mongodb.uri;
}

/** Single-process caches preserve the existing synchronous read APIs. Writes are awaited. */
export class PersistentStore<T extends RecordData> {
  private baseline = new Map<string, string>();
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private model: MongoRecordModel<T>,
    private file: string,
    private get: () => T[],
    private set: (records: T[]) => void,
  ) {
    stores.push(this as unknown as PersistentStore<RecordData>);
  }

  async initialize(db: Db): Promise<void> {
    const collection = this.model.collection(db);
    await this.model.ensureIndexes(db);
    const name = this.model.collectionName;
    const migrations = db.collection<{ _id: string; completedAt: Date }>('_migrations');
    if (!await migrations.findOne({ _id: name })) {
      const records = this.get().map(value => this.model.parse(value));
      if (records.length) {
        await collection.bulkWrite(records.map((value, position) => ({
          updateOne: {
            filter: { _id: value.id },
            update: { $setOnInsert: { position, value } },
            upsert: true,
          },
        })));
      }
      await migrations.updateOne({ _id: name }, { $setOnInsert: { completedAt: new Date() } }, { upsert: true });
    }
    const records = await collection.find().sort({ position: 1 }).toArray();
    this.set(records.map(record => this.model.fromDocument(record)));
    this.baseline = new Map(records.map(record => [record._id, JSON.stringify(record)]));
  }

  async save(): Promise<void> {
    // Capture before queuing so later mutations cannot change an in-flight write.
    const values: T[] = JSON.parse(JSON.stringify(this.get())).map((value: unknown) => this.model.parse(value));
    if (new Set(values.map(value => value.id)).size !== values.length) {
      throw new Error(`${this.model.collectionName}: duplicate record IDs`);
    }
    if (!isMongoEnabled()) {
      fs.writeFileSync(this.file, JSON.stringify(values, null, 2), 'utf-8');
      return Promise.resolve();
    }
    const operation = this.pending.then(async () => {
      if (!database) throw new Error('MongoDB storage has not been initialized');
      const next = new Map<string, string>();
      const writes: AnyBulkWriteOperation<StoredRecord<T>>[] = [];
      values.forEach((value, position) => {
        const record = this.model.toDocument(value, position);
        const serialized = JSON.stringify(record);
        next.set(value.id, serialized);
        if (this.baseline.get(value.id) !== serialized) {
          writes.push({ replaceOne: { filter: { _id: value.id }, replacement: record, upsert: true } });
        }
      });
      for (const id of this.baseline.keys()) {
        if (!next.has(id)) writes.push({ deleteOne: { filter: { _id: id } } });
      }
      if (writes.length) await this.model.collection(database).bulkWrite(writes);
      this.baseline = next;
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}

export async function initializeDatabase(): Promise<void> {
  if (!isMongoEnabled() || database) return;
  client = new MongoClient(config.mongodb.uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  try {
    await client.connect();
    const uriDatabase = new URL(config.mongodb.uri).pathname.slice(1);
    const db = client.db(config.mongodb.database || decodeURIComponent(uriDatabase) || 'voiceai');
    await db.command({ ping: 1 });
    for (const store of stores) await store.initialize(db);
    database = db;
  } catch (error) {
    await closeDatabase();
    // Do not expose credentials from driver errors.
    const name = error instanceof Error ? error.name : 'UnknownError';
    const code = (error as { code?: number }).code;
    throw new Error(`MongoDB initialization failed (${name}${code ? `, code ${code}` : ''}). Check Atlas credentials, cluster availability, and network access.`);
  }
}

export async function databaseStatus(): Promise<'ok' | 'error' | 'disabled'> {
  if (!isMongoEnabled()) return 'disabled';
  if (!database) return 'error';
  try {
    await database.command({ ping: 1 }, { timeoutMS: 5000 });
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  database = undefined;
  client = undefined;
}
