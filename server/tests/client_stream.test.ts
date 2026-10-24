import { streamTurn } from '../../shared/browserConversation';
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
test('delivers partial text and tool events before completion, including split UTF-8', async () => {
 const encoder = new TextEncoder(); let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 const observed: string[] = [];
 const wire = encoder.encode(JSON.stringify({ type: 'delta', text: 'नमस्ते' }) + '\n');
 const body = new ReadableStream({ async start(controller) { for (const byte of wire) controller.enqueue(new Uint8Array([byte])); await gate; controller.enqueue(encoder.encode(JSON.stringify({ type: 'tool_result', name: 'check_booking', status: 'completed', result: '{}', timestamp: 1 }) + '\n' + JSON.stringify({ type: 'complete', output: 'नमस्ते' }) + '\n')); controller.close(); } });
 global.fetch = jest.fn().mockResolvedValue({ ok: true, body });
 const result = streamTurn('id', 'hello', text => { observed.push(text); release(); }, undefined, undefined, event => observed.push(event.name));
 await expect(result).resolves.toMatchObject({ output: 'नमस्ते' }); expect(observed).toEqual(['नमस्ते', 'check_booking']);
});
test('rejects incomplete streams instead of treating partial text as completed', async () => {
 global.fetch = jest.fn().mockResolvedValue({ ok: true, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"type":"delta","text":"partial"}\n')); controller.close(); } }) });
 await expect(streamTurn('id', 'hello')).rejects.toThrow('before the response completed');
});
