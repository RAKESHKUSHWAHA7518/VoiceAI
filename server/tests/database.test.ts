import config from '../src/config';
import { z } from 'zod';
import { MongoRecordModel } from '../src/models/base';
import { MongoClient } from 'mongodb';
import { PersistentStore, initializeDatabase, closeDatabase, databaseStatus } from '../src/services/database';

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => {
    const collections = new Map();
    const db = {
      command: jest.fn().mockResolvedValue({ ok: 1 }),
      collection: (name: string) => {
        if (!collections.has(name)) {
          const records = new Map();
          collections.set(name, {
            records,
            createIndexes: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(async (filter: any) => records.get(filter._id)),
            updateOne: jest.fn(async (filter: any, update: any) => {
              if (!records.has(filter._id)) records.set(filter._id, { _id: filter._id, ...update.$setOnInsert });
            }),
            find: () => ({ sort: () => ({ toArray: async () => Array.from(records.values()).sort((a: any, b: any) => a.position - b.position) }) }),
            bulkWrite: jest.fn(async (operations: any[]) => {
              for (const operation of operations) {
                if (operation.updateOne) {
                  const { filter, update } = operation.updateOne;
                  if (!records.has(filter._id)) records.set(filter._id, { _id: filter._id, ...update.$setOnInsert });
                } else if (operation.replaceOne) {
                  records.set(operation.replaceOne.filter._id, operation.replaceOne.replacement);
                } else {
                  records.delete(operation.deleteOne.filter._id);
                }
              }
            }),
          });
        }
        return collections.get(name);
      },
    };
    return { connect: jest.fn(), close: jest.fn(), db: () => db };
  }),
}));

test('imports once, awaits writes, restores records, and does not revive deleted records', async () => {
  config.mongodb.uri = 'mongodb://localhost/voiceai';
  let values = [{ id: 'existing', text: 'local record' }];
  const model = new MongoRecordModel('test_records', z.object({ id: z.string().min(1), text: z.string() }));
  const store = new PersistentStore(model, 'unused.json', () => values, records => { values = records; });
  try {
    await initializeDatabase();
    const client: any = (MongoClient as unknown as jest.Mock).mock.results[0].value;
    const db = client.db();
    const collection = db.collection('test_records');
    expect(collection.createIndexes).toHaveBeenCalledWith([{ key: { position: 1 }, name: 'record_position' }]);
    expect(collection.records.get('existing').value.text).toBe('local record');
    expect(await databaseStatus()).toBe('ok');

    const writeCount = collection.bulkWrite.mock.calls.length;
    values.push({ id: '', text: 'invalid' });
    await expect(store.save()).rejects.toThrow();
    expect(collection.bulkWrite.mock.calls).toHaveLength(writeCount);
    values.pop();

    values.unshift({ id: 'new', text: 'new record' });
    await store.save();
    values = [];
    await store.initialize(db);
    expect(values.map(value => value.id)).toEqual(['new', 'existing']);

    // Serialized snapshots keep overlapping saves in their original order.
    values[0].text = 'first';
    const first = store.save();
    values[0].text = 'second';
    const second = store.save();
    await Promise.all([first, second]);
    expect(collection.records.get('new').value.text).toBe('second');

    collection.bulkWrite.mockRejectedValueOnce(new Error('write unavailable'));
    values[0].text = 'retry';
    await expect(store.save()).rejects.toThrow('write unavailable');
    await store.save();
    expect(collection.records.get('new').value.text).toBe('retry');

    values = [];
    await store.save();
    // Simulate a restart with the original JSON still on disk.
    values = [{ id: 'existing', text: 'local record' }];
    await store.initialize(db);
    expect(values).toEqual([]);
    db.command.mockRejectedValueOnce(new Error('offline'));
    expect(await databaseStatus()).toBe('error');
  } finally {
    await closeDatabase();
    config.mongodb.uri = '';
  }
});

test('reports disabled storage when MongoDB is not configured', async () => {
  expect(await databaseStatus()).toBe('disabled');
});
