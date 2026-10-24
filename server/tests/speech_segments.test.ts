import { speechSegments } from '../../shared/speechSegments';
test('long replies retain all text in bounded segments without splitting emoji', () => {
 const text = ('A reply with words and emoji 😀. ').repeat(300); const chunks = speechSegments(text);
 expect(chunks.length).toBeGreaterThan(1); expect(chunks.join('')).toBe(text);
 for (const chunk of chunks) { expect(chunk.length).toBeLessThanOrEqual(1500); expect(chunk.length).toBeGreaterThan(0); expect(/[\uD800-\uDBFF]$/.test(chunk)).toBe(false); }
 expect(speechSegments('')).toEqual([]);
});
