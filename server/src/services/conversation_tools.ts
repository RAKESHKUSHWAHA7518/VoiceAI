import { z } from 'zod';
import { AgentRecord } from '../models/agent.model';
import { createDemoTools, fetchLiveWeather } from './tools';

interface Fixture { id: string; workspace_id: string; kind: string; name: string; value: string; notes: string }
let fixtures: () => Fixture[] = () => [];
export function registerConversationFixtures(read: () => Fixture[]) { fixtures = read; }

export interface ConversationTool { name: string; description: string; parameters: any; execute: (args: any) => unknown }

export function conversationTools(workspace: string, agent: AgentRecord): ConversationTool[] {
  // Only explicitly supported built-ins and workspace-owned fixtures are exposed.
  const allTools = createDemoTools();
  const tools: ConversationTool[] = [...allTools.values()].map(tool => ({
    name: tool.name,
    description: tool.name === 'get_weather'
      ? 'Get current live real-time weather and temperature for any city or location.'
      : 'SIMULATION ONLY: ' + tool.description,
    parameters: { ...tool.parameters, additionalProperties: false },
    execute: (args: any) => {
      if (process.env.NODE_ENV !== 'test' && tool.name === 'get_weather') {
        return fetchLiveWeather(args.location);
      }
      if (tool.name === 'get_weather') {
        return {
          mode: 'simulation',
          external_request: false,
          tool: tool.name,
          arguments: args,
          result: { location: args.location, temperature_c: 22, condition: 'sunny', fixture: true },
          message: 'Local demonstration only. No live weather lookup, booking, notification or transfer occurred.'
        };
      }
      if (tool.name === 'check_booking') {
        return {
          mode: 'simulation',
          external_request: false,
          tool: tool.name,
          arguments: args,
          result: { booking_id: args.booking_id, status: 'sample-confirmed', fixture: true },
          message: 'Local demonstration only. No live weather lookup, booking, notification or transfer occurred.'
        };
      }
      if (tool.name === 'check_availability') {
        return {
          mode: 'simulation',
          external_request: false,
          tool: tool.name,
          arguments: args,
          result: { date: args.date || 'sample day', slots: ['09:00', '10:30'], fixture: true },
          message: 'Local demonstration only. No live weather lookup, booking, notification or transfer occurred.'
        };
      }
      if (tool.mock_response) {
        try {
          return { mode: 'mock', external_request: false, result: JSON.parse(tool.mock_response), arguments: args };
        } catch {
          return { mode: 'mock', external_request: false, result: tool.mock_response, arguments: args };
        }
      }
return { mode: 'simulation', external_request: false, tool: tool.name, arguments: args, result: { status: 'simulated-only' }, message: 'Local demonstration only. No live weather lookup, booking, notification or transfer occurred.' };
    }
  }));

  const selected = tools.filter(tool => agent.assigned_tools.includes(tool.name));
  for (const record of fixtures()) {
    if (record.workspace_id !== workspace || record.kind !== 'tool' || !agent.assigned_tools.includes(record.id)) continue;
    selected.push({
      name: 'fixture_' + record.id.replace(/-/g, ''),
      description: ('MOCK RESPONSE: ' + record.name + '. ' + record.notes).slice(0, 1000),
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ mode: 'mock', external_request: false, result: JSON.parse(record.value) })
    });
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
  if (typeof result === 'object' && result !== null && 'then' in (result as any)) {
    return (result as Promise<any>).then(res => {
      if (JSON.stringify(res).length > 16000) throw new Error('TOOL_RESULT_LIMIT');
      return res;
    });
  }
  if (JSON.stringify(result).length > 16000) throw new Error('TOOL_RESULT_LIMIT');
  return result;
}
