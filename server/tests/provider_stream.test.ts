import { Readable } from 'stream';
const mockPost = jest.fn();
jest.unmock('../src/services/llm');
jest.mock('axios', () => ({ __esModule: true, default: { create: () => ({ post: mockPost }) } }));
import { OpenAILLM } from '../src/services/llm';
async function collect(stream: AsyncIterable<any>) { const items = []; for await (const item of stream) items.push(item); return items; }
test('fragmented provider tool streams preserve metadata and reject argument repair', async () => {
 const frame = (delta: any, finish_reason: string | null = null) => 'data: ' + JSON.stringify({ choices: [{ delta, finish_reason }] }) + '\n\n';
 const wire = frame({ tool_calls: [{ index: 0, id: 'g1', extra_content: { google: { thought_signature: 'opaque' } }, function: { name: 'check_booking', arguments: '{"booking_id":' } }] }) + frame({ tool_calls: [{ index: 0, function: { arguments: '"DEMO"' } }] }) + frame({}, 'tool_calls');
 mockPost.mockResolvedValue({ data: Readable.from([...wire].map(char => Buffer.from(char))) });
 const events = await collect(new OpenAILLM('fake').streamChat([], 'test'));
 expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ toolArgs: '{"booking_id":"DEMO"', toolCallExtra: { google: { thought_signature: 'opaque' } } });
});
test('provider quota errors are actionable without leaking response credentials', async () => {
 mockPost.mockRejectedValue({ response: { status: 429, data: 'secret' } });
 await expect(collect(new OpenAILLM('fake').streamChat([], 'test'))).rejects.toThrow('PROVIDER_RATE_LIMITED');
});
