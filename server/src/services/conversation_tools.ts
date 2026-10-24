import { z } from 'zod';
import { AgentRecord } from '../models/agent.model';
import { createDemoTools } from './tools';
interface Fixture { id: string; workspace_id: string; kind: string; name: string; value: string; notes: string }
let fixtures: () => Fixture[] = () => [];
export function registerConversationFixtures(read: () => Fixture[]) { fixtures = read; }
export interface ConversationTool { name: string; description: string; parameters: any; execute: (args: any) => unknown }
export function conversationTools(workspace: string, agent: AgentRecord): ConversationTool[] {
  // Never reuse legacy handlers: calendar writes and carrier-like outcomes are shared simulations.
  const tools: ConversationTool[] = [...createDemoTools().values()].map(tool => ({ name: tool.name, description: 'SIMULATION ONLY: ' + tool.description, parameters: { ...tool.parameters, additionalProperties: false }, execute: (args: any) => ({ mode: 'simulation', external_request: false, tool: tool.name, arguments: args, result: tool.name === 'get_weather' ? { location: args.location, temperature_c: 22, condition: 'sunny', fixture: true } : tool.name === 'check_booking' ? { booking_id: args.booking_id, status: 'sample-confirmed', fixture: true } : tool.name === 'check_availability' ? { date: args.date || 'sample day', slots: ['09:00', '10:30'], fixture: true } : { status: 'simulated-only' }, message: 'Local demonstration only. No live weather lookup, booking, notification or transfer occurred.' }) }));
  const selected = tools.filter(tool => agent.assigned_tools.includes(tool.name));
  for (const record of fixtures()) {
    if (record.workspace_id !== workspace || record.kind !== 'tool' || !agent.assigned_tools.includes(record.id)) continue;
    selected.push({ name: 'fixture_' + record.id.replace(/-/g, ''), description: ('MOCK RESPONSE: ' + record.name + '. ' + record.notes).slice(0, 1000), parameters: { type: 'object', properties: {}, additionalProperties: false }, execute: () => ({ mode: 'mock', external_request: false, result: JSON.parse(record.value) }) });
  }
  return selected;
}
export function executeConversationTool(workspace: string, agent: AgentRecord, name: string, raw: string, signal: AbortSignal) {
  if (signal.aborted) throw new Error('TURN_CANCELLED');
  const tool = conversationTools(workspace, agent).find(value => value.name === name);
  if (!tool) throw new Error('TOOL_NOT_ASSIGNED');
  if (raw.length > 8000) throw new Error('TOOL_ARGUMENT_LIMIT');
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(tool.parameters.properties || {}) as Array<[string, any]>) {
    let validator: z.ZodTypeAny = field.enum ? z.enum(field.enum as [string, ...string[]]) : z.string().trim().min(1).max(2000);
    if (!(tool.parameters.required || []).includes(key)) validator = validator.optional();
    shape[key] = validator;
  }
  const args = z.object(shape).strict().parse(JSON.parse(raw));
  const result = tool.execute(args);
  if (JSON.stringify(result).length > 16000) throw new Error('TOOL_RESULT_LIMIT');
  return result;
}
