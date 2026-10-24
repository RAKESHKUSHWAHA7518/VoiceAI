import { completeSSEFrames } from '../src/utils/sse';
async function collect(chunks: Buffer[]) {
  async function* stream() { yield* chunks; }
  const frames: string[] = []; for await (const frame of completeSSEFrames(stream())) frames.push(frame); return frames;
}
test('preserves split SSE frames and multibyte speech text at every byte boundary', async () => {
  const input = Buffer.from('data: {"text":"नमस्ते"}\r\n\r\ndata: [DONE]\n\n');
  const frames = await collect(Array.from(input, value => Buffer.from([value])));
  expect(frames).toEqual(['data: {"text":"नमस्ते"}', 'data: [DONE]']);
});
test('preserves multiple events in one network chunk and a final unterminated event', async () => {
  expect(await collect([Buffer.from('data: one\n\ndata: two\n\ndata: three')])).toEqual(['data: one', 'data: two', 'data: three']);
});
test('bounds an unframed provider response', async () => {
  await expect(collect([Buffer.alloc(1024 * 1024 + 1, 65)])).rejects.toThrow('frame limit');
});
