import { Collection, Db, IndexDescription } from 'mongodb';
import { z } from 'zod';

export type StoredRecord<T extends { id: string }> = { _id: string; position: number; value: T };

/** Models own collection names, runtime schemas, and indexes for the native driver. */
export class MongoRecordModel<T extends { id: string }> {
  constructor(
    readonly collectionName: string,
    readonly schema: z.ZodType<T>,
    readonly indexes: IndexDescription[] = [],
  ) {}

  collection(db: Db): Collection<StoredRecord<T>> {
    return db.collection<StoredRecord<T>>(this.collectionName);
  }

  parse(value: unknown): T {
    return this.schema.parse(value);
  }

  toDocument(value: unknown, position: number): StoredRecord<T> {
    const parsed = this.parse(value);
    z.number().int().nonnegative().parse(position);
    return { _id: parsed.id, position, value: parsed };
  }

  fromDocument(document: StoredRecord<T>): T {
    const value = this.parse(document.value);
    if (document._id !== value.id) throw new Error(`${this.collectionName}: document ID does not match record ID`);
    z.number().int().nonnegative().parse(document.position);
    return value;
  }

  async ensureIndexes(db: Db): Promise<void> {
    await this.collection(db).createIndexes([
      { key: { position: 1 }, name: 'record_position' },
      ...this.indexes,
    ]);
  }
}

export const recordId = z.string().min(1);
export const count = z.number().int().nonnegative();
