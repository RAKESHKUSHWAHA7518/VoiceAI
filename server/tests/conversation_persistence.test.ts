const mockSave = jest.fn();
jest.mock('../src/services/conversation_history', () => ({ saveConversationRecord: (...args: unknown[]) => mockSave(...args) }));
jest.mock('../src/services/rag', () => ({ ragEngine: { search: () => [] } }));
import { createConversation, findConversation, conversationTurn, closeConversation } from '../src/services/conversations';
const agent: any = { id: 'persist-agent', name: 'Test', role: 'Support', avatar: '', voice_id: 'voice', llm_model: 'test', llm_temperature: .3, system_prompt: 'Helpful', assigned_tools: [], greeting: 'Hello' };
test('history failure rejects completion and preserves context; a later retry can save', async () => {
 process.env.VOICEAI_RUNTIME_MODE = 'demo'; mockSave.mockRejectedValueOnce(new Error('Disk unavailable'));
 const opened = createConversation('persistence-test', agent, { saveHistory: true }); const session = findConversation('persistence-test', opened.session_id)!;
 const events: any[] = [];
 try {
  await expect((async () => { for await (const event of conversationTurn(session, 'Hello')) events.push(event); })()).rejects.toThrow('HISTORY_SAVE_FAILED');
  expect(events.some(event => event.type === 'complete')).toBe(false); expect(session.history).toEqual([]); expect(session.turns).toBe(0);
  expect(mockSave).toHaveBeenCalledTimes(1);
  mockSave.mockResolvedValue(undefined);
  for await (const event of conversationTurn(session, 'Hello again')) events.push(event);
  expect(events.at(-1).type).toBe('complete'); expect(session.history).toHaveLength(2); expect(session.turns).toBe(1);
 } finally { closeConversation('persistence-test', opened.session_id); }
});
