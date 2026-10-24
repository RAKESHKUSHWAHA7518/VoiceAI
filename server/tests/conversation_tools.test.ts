const registry = require('../src/services/tools');
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

test('production conversations never execute legacy booking or transfer handlers', () => {
 const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
 const handler = jest.fn(() => { throw new Error('Legacy side effect must not run'); });
 const registrySpy = jest.spyOn(registry, 'createDemoTools').mockReturnValue(new Map(['book_appointment', 'transfer_call'].map(name => [name, { name, description: 'legacy action', parameters: { type: 'object', properties: {} }, handler }])));
 try {
  const selected: any = { assigned_tools: ['book_appointment', 'transfer_call'] };
  for (const name of selected.assigned_tools) expect(executeConversationTool('a', selected, name, '{}', signal)).toMatchObject({ mode: 'simulation', external_request: false });
  expect(handler).not.toHaveBeenCalled();
 } finally { registrySpy.mockRestore(); process.env.NODE_ENV = previous; }
});
