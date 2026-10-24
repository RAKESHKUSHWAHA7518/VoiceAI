import { conversationTools, executeConversationTool, registerConversationFixtures } from '../src/services/conversation_tools';
const agent: any = { assigned_tools: ['check_booking'] };
const signal = new AbortController().signal;
afterEach(() => registerConversationFixtures(() => []));
test('only assigned tools run and arguments are strictly validated', () => {
 expect(() => executeConversationTool('a', agent, 'get_weather', '{"location":"Delhi"}', signal)).toThrow('TOOL_NOT_ASSIGNED');
 expect(() => executeConversationTool('a', agent, 'check_booking', '{}', signal)).toThrow();
 expect(() => executeConversationTool('a', agent, 'check_booking', '{"booking_id":"a","extra":true}', signal)).toThrow();
 expect(executeConversationTool('a', agent, 'check_booking', '{"booking_id":"a"}', signal)).toMatchObject({ mode: 'simulation', external_request: false });
});
test('private fixtures cannot be resolved across workspaces or after deletion', () => {
 let records = [{ id: 'abc-123', workspace_id: 'a', kind: 'tool', name: 'Policy', value: '{"hours":"9–5"}', notes: '' }];
 registerConversationFixtures(() => records);
 const selected: any = { assigned_tools: ['abc-123'] };
 expect(conversationTools('b', selected)).toHaveLength(0);
 expect(executeConversationTool('a', selected, 'fixture_abc123', '{}', signal)).toMatchObject({ mode: 'mock', result: { hours: '9–5' } });
 records = [];
 expect(() => executeConversationTool('a', selected, 'fixture_abc123', '{}', signal)).toThrow('TOOL_NOT_ASSIGNED');
});
test('cancelled calls never execute', () => {
 const abort = new AbortController(); abort.abort();
 expect(() => executeConversationTool('a', agent, 'check_booking', '{"booking_id":"a"}', abort.signal)).toThrow('TURN_CANCELLED');
});
