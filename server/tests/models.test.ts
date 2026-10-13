import fs from 'fs';
import path from 'path';
import { CallModel, AppointmentModel, PhoneNumberModel, VoiceModel, KnowledgeDocumentModel, KnowledgeChunkModel } from '../src/models';

const models = [
  { model: CallModel, file: 'calls.json' },
  { model: AppointmentModel, file: 'appointments.json' },
  { model: PhoneNumberModel, file: 'phone_numbers.json' },
  { model: VoiceModel, file: 'custom_voices.json' },
  { model: KnowledgeDocumentModel, file: 'knowledge/documents.json' },
  { model: KnowledgeChunkModel, file: 'knowledge/chunks.json' },
];

test.each(models)('$model.collectionName validates existing records and preserves the storage format', ({ model, file }) => {
  const records = JSON.parse(fs.readFileSync(path.join(__dirname, '../data', file), 'utf8'));
  for (const record of records) {
    const document = model.toDocument(record, 0);
    expect(document._id).toBe(record.id);
    expect(model.fromDocument(document as never)).toEqual(record);
    expect(() => model.parse({ ...record, id: '' })).toThrow();
    expect(() => model.fromDocument({ ...document, _id: 'mismatched' } as never)).toThrow('ID does not match');
  }
});

test('rejects unsupported enums, missing required fields, and invalid numeric values', () => {
  const call = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/calls.json'), 'utf8'))[0];
  expect(() => CallModel.parse({ ...call, sentiment: 'unsupported' })).toThrow();
  expect(() => CallModel.parse({ ...call, tool_calls_count: -1 })).toThrow();
  expect(() => CallModel.parse({ ...call, qa_scores: undefined })).toThrow();
});
