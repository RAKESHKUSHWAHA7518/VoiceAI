import { createConversation, findConversation, closeConversation, interruptConversation, conversationTurn } from '../src/services/conversations';
import config from '../src/config';
const mockStream = jest.fn();
const mockConstructor = jest.fn();
jest.mock('../src/services/llm', () => ({ OpenAILLM: class { constructor(...args: unknown[]) { mockConstructor(...args); } setSystemPrompt() {} streamChat(...args: unknown[]) { return mockStream(...args); } } }));
jest.mock('../src/services/rag', () => ({ ragEngine: { search: jest.fn().mockReturnValue([]) } }));
const agent = { id: 'test-agent', name: 'Test', workspace_id: 'test', role: 'Support', avatar: '', voice_id: 'voice', llm_model: 'gpt-test', llm_temperature: .3, system_prompt: 'Be helpful', assigned_tools: [], greeting: 'Hello' };
async function run(session: ReturnType<typeof findConversation>, text: string) { const events: any[] = []; for await (const event of conversationTurn(session!, text)) events.push(event); return events; }
afterEach(() => { process.env.VOICEAI_RUNTIME_MODE = 'demo'; });
test('snapshots configuration, keeps history and reports demo measurements honestly', async () => {
  process.env.VOICEAI_RUNTIME_MODE = 'demo';
  const snapshot = { ...agent }; const opened = createConversation('history', snapshot); snapshot.greeting = 'Changed';
  const session = findConversation('history', opened.session_id)!;
  expect(session.agent.greeting).toBe('Hello'); expect(findConversation('other', opened.session_id)).toBeUndefined();
  const events = await run(session, 'Hello');
  expect(events.at(-1)).toMatchObject({ type: 'complete', runtime_mode: 'demo', metrics: { llm_ttft_ms: null, audible_latency_ms: null } });
  expect(session.history).toHaveLength(2);
  closeConversation('history', opened.session_id);
});
test('streams real-provider output through the contract and forwards prior history', async () => {
  process.env.VOICEAI_RUNTIME_MODE = 'live'; config.apiKeys.openai = 'test-only';
  mockStream.mockImplementation(async function* () { yield { content: 'A response' }; });
  const opened = createConversation('live', agent); const session = findConversation('live', opened.session_id)!;
  await run(session, 'First question'); await run(session, 'Follow-up');
  expect(mockStream.mock.calls.at(-1)[0]).toHaveLength(2);
  closeConversation('live', opened.session_id);
});
test('cancels an active turn without committing an unheard assistant response', async () => {
  process.env.VOICEAI_RUNTIME_MODE = 'live'; config.apiKeys.openai = 'test-only';
  mockStream.mockImplementation(async function* () { yield { content: 'First phrase' }; yield { content: 'Stale phrase' }; });
  const opened = createConversation('cancel', agent); const session = findConversation('cancel', opened.session_id)!;
  const stream = conversationTurn(session, 'Question'); await stream.next();
  await expect(run(session, 'Overlapping turn')).rejects.toThrow('TURN_ACTIVE');
  interruptConversation('cancel', opened.session_id);
  await expect(stream.next()).rejects.toThrow('TURN_CANCELLED');
  expect(session.history).toHaveLength(0); expect(session.active).toBeUndefined();
  closeConversation('cancel', opened.session_id);
});
test('fails live mode explicitly when credentials are missing', async () => {
  process.env.VOICEAI_RUNTIME_MODE = 'live'; config.apiKeys.openai = '';
  const opened = createConversation('missing', agent);
  await expect(run(findConversation('missing', opened.session_id), 'Hello')).rejects.toThrow('PROVIDER_NOT_CONFIGURED');
  closeConversation('missing', opened.session_id);
});

test("demo tool commands execute assigned tools and expose errors", async () => {
 const opened = createConversation("demo-tools", { ...agent, assigned_tools: ["check_booking"] }, { enableTools: true });
 const session = findConversation("demo-tools", opened.session_id)!;
 const success = await run(session, '/tool check_booking {"booking_id":"DEMO"}');
 expect(success.find(event => event.type === "tool_result")).toMatchObject({ name: "check_booking", status: "completed" });
 const denied = await run(session, '/tool get_weather {"location":"Delhi"}');
 expect(denied.at(-1).tool_events[0].status).toBe("error");
 closeConversation("demo-tools", opened.session_id);
});
test("live tool results are returned to the model in protocol messages", async () => {
 process.env.VOICEAI_RUNTIME_MODE = "live"; config.apiKeys.openai = "test-only";
 let call = 0; mockStream.mockImplementation(async function* () { if (call++ === 0) yield { isToolCall: true, toolCallId: "call-1", toolName: "check_booking", toolArgs: '{"booking_id":"DEMO"}' }; else yield { content: "This is a simulation." }; });
 const opened = createConversation("live-tools", { ...agent, assigned_tools: ["check_booking"] }, { enableTools: true });
 const events = await run(findConversation("live-tools", opened.session_id), "Check booking DEMO");
 expect(mockStream.mock.calls.at(-1)[5]).toEqual(expect.arrayContaining([expect.objectContaining({ role: "tool", tool_call_id: "call-1" })]));
 expect(events.at(-1).tool_events).toHaveLength(1);
 expect(events.at(-1).tool_events[0].status).toBe("completed");
 closeConversation("live-tools", opened.session_id);
});

test("public sessions do not expose assigned tool fixture results", async () => {
 const opened = createConversation("public-tools", { ...agent, assigned_tools: ["check_booking"] });
 expect(opened.tools_enabled).toBe(false);
 const events = await run(findConversation("public-tools", opened.session_id), '/tool check_booking {"booking_id":"DEMO"}');
 expect(events.at(-1).tool_events[0].status).toBe("error");
 closeConversation("public-tools", opened.session_id);
});

test('Gemini uses its own key and compatibility endpoint with tool feedback', async () => {
 process.env.VOICEAI_RUNTIME_MODE = 'live'; config.apiKeys.gemini = 'gemini-test-only';
 let call = 0; mockStream.mockImplementation(async function* () { if (call++ === 0) yield { isToolCall: true, toolCallId: 'g1', toolCallExtra: { google: { thought_signature: 'opaque-test' } }, toolName: 'check_booking', toolArgs: '{"booking_id":"DEMO"}' }; else { yield { content: 'Sample ' }; yield { content: 'only.' }; } });
 const opened = createConversation('gemini-test', { ...agent, llm_model: 'gemini/test-model', assigned_tools: ['check_booking'] }, { enableTools: true });
 const events = await run(findConversation('gemini-test', opened.session_id), 'Check booking DEMO');
 expect(mockConstructor.mock.calls.at(-1)).toEqual(['gemini-test-only', 'test-model', .3, 512, 'https://generativelanguage.googleapis.com/v1beta/openai']);
 expect(mockStream.mock.calls.at(-1)[5]).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'assistant', tool_calls: [expect.objectContaining({ extra_content: { google: { thought_signature: 'opaque-test' } } })] })]));
 expect(events.filter(event => event.type === 'delta')).toHaveLength(2);
 expect(events.at(-1).tool_events[0].status).toBe('completed'); closeConversation('gemini-test', opened.session_id);
});
test('missing Gemini key cannot fall through to another provider', async () => {
 process.env.VOICEAI_RUNTIME_MODE = 'live'; config.apiKeys.gemini = ''; config.apiKeys.openai = 'unrelated';
 const opened = createConversation('gemini-missing', { ...agent, llm_model: 'gemini/test-model' });
 await expect(run(findConversation('gemini-missing', opened.session_id), 'Hi')).rejects.toThrow('PROVIDER_NOT_CONFIGURED');
 closeConversation('gemini-missing', opened.session_id);
});

test('a public live session refuses unsolicited model tool calls', async () => {
 process.env.VOICEAI_RUNTIME_MODE = 'live'; config.apiKeys.openai = 'fake'; let n = 0;
 mockStream.mockImplementation(async function* () { if (n++ === 0) yield { isToolCall: true, toolCallId: 'bad', toolName: 'check_booking', toolArgs: '{"booking_id":"DEMO"}' }; else yield { content: 'Unavailable.' }; });
 const opened = createConversation('public-live', { ...agent, assigned_tools: ['check_booking'] });
 const events = await run(findConversation('public-live', opened.session_id), 'test');
 expect(events.at(-1).tool_events[0].status).toBe('error');
 closeConversation('public-live', opened.session_id);
});
