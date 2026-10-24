import fs from 'fs';
import { ragEngine } from '../src/services/rag';

const mockText = jest.fn(); const mockDestroy = jest.fn();
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn().mockImplementation(() => ({ getText: mockText, destroy: mockDestroy })) }));
beforeEach(() => { mockText.mockReset(); mockDestroy.mockReset().mockResolvedValue(undefined); jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('%PDF-test-fixture')); });
afterEach(() => jest.restoreAllMocks());

test('extracts PDF text using the installed parser interface and releases its worker', async () => {
  mockText.mockResolvedValue({ text: 'Bookings can be cancelled with 24 hours notice.' });
  await expect(ragEngine.extractText('/test/policy.pdf', 'pdf')).resolves.toContain('24 hours');
  expect(mockText).toHaveBeenCalledWith({ pageJoiner: '' });
  expect(mockDestroy).toHaveBeenCalledTimes(1);
});
test('a broken PDF is rejected instead of indexing raw binary bytes', async () => {
  mockText.mockRejectedValue(new Error('Corrupt PDF'));
  await expect(ragEngine.extractText('/test/broken.pdf', 'pdf')).rejects.toThrow('Could not read this PDF');
  expect(mockDestroy).toHaveBeenCalledTimes(1);
});
test('a PDF without readable text gives an actionable error', async () => {
  mockText.mockResolvedValue({ text: '' });
  await expect(ragEngine.extractText('/test/scanned.pdf', 'pdf')).rejects.toThrow('Scanned PDFs need OCR');
  expect(mockDestroy).toHaveBeenCalledTimes(1);
});
test('empty sources cannot become indexed knowledge', async () => {
  await expect(ragEngine.ingestText('agent', 'Empty source', 'empty.txt', 'txt', 3, '   ')).rejects.toThrow('no readable text');
});
