import { EventEmitter } from 'events';
import { ToolDefinition, ToolRegistry, CircuitBreaker, ToolExecutor, ToolResult } from '../types';
import config from '../config';
import axios from 'axios';

export class ToolRegistryImpl implements ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getSchema(): any[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  getHandler(name: string) {
    const tool = this.tools.get(name);
    return tool?.handler;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export class CircuitBreakerImpl implements CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private failureThreshold: number = 3,
    private timeout: number = 30000,
    private expectedError: any = Error
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker open');
      }
    }

    try {
      const result = await fn();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
      }
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'open';
      }
      throw error;
    }
  }

  isOpen(): boolean {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  getState(): string {
    return this.state;
  }

  getFallbackMessage(): string {
    return "I'm having trouble reaching that service right now. Could we try again in a moment, or would you like me to help with something else?";
  }
}

export class ToolExecutorImpl implements ToolExecutor {
  private registry: ToolRegistry;
  private fillerAudioPool: string[];
  private fillerDelayThresholdMs: number;
  private toolTimeout: number;
  private circuitBreakers: Map<string, CircuitBreakerImpl> = new Map();
  private ttsCallback?: (text: string) => Promise<void>;

  constructor(
    registry: ToolRegistry,
    fillerAudioPool?: string[],
    fillerDelayThresholdMs: number = 400,
    toolTimeout: number = 1.5,
    ttsCallback?: (text: string) => Promise<void>
  ) {
    this.registry = registry;
    this.fillerAudioPool = fillerAudioPool || [
      "Let me check that for you...",
      "One moment please...",
      "I'll look that up...",
      "Give me a second...",
      "Let me see...",
      "Checking now...",
    ];
    this.fillerDelayThresholdMs = fillerDelayThresholdMs;
    this.toolTimeout = toolTimeout * 1000;
  }

  setTTSCallback(callback: (text: string) => Promise<void>): void {
    this.ttsCallback = callback;
  }

  private _getBreaker(name: string): CircuitBreakerImpl {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreakerImpl());
    }
    return this.circuitBreakers.get(name)!;
  }

  async execute(
    toolName: string,
    arguments_: Record<string, unknown>,
    onFiller?: (text: string) => Promise<void>
  ): Promise<[any, boolean, boolean]> {
    const handler = this.registry.getHandler(toolName);
    if (!handler) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const breaker = this._getBreaker(toolName);
    const fillerCallback = onFiller || this.ttsCallback;
    let fillerTask: NodeJS.Timeout | null = null;
    let usedFiller = false;
    let usedFallback = false;

    const runWithFiller = async () => {
      await new Promise(resolve => setTimeout(resolve, this.fillerDelayThresholdMs));
      if (fillerCallback) {
        const fillerText = this.fillerAudioPool[Math.floor(Math.random() * this.fillerAudioPool.length)];
        await fillerCallback(fillerText);
        usedFiller = true;
      }
    };

    try {
      const fillerPromise = runWithFiller();
      const result = await Promise.race([
        this.executeWithTimeout(handler, arguments_),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Tool timeout')), this.toolTimeout)
        ),
      ]);
      return [result, usedFiller, false];
    } catch (error: any) {
      if (error.message === 'Tool timeout') {
        // Timeout - use fallback
        return [this.getTimeoutFallback(toolName), true, true];
      }
      if (error.message?.includes('Circuit breaker')) {
        return [this.getCircuitBreakerFallback(toolName), true, true];
      }
      throw error;
    } finally {
      // Clear filler timeout if still pending
    }
  }

  private async executeWithTimeout(handler: Function, args: any): Promise<any> {
    return await Promise.race([
      handler(args),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tool timeout')), this.toolTimeout)
      ),
    ]);
  }

  private getTimeoutFallback(toolName: string): any {
    return {
      fallback: true,
      timeout: true,
      message: `The ${toolName} service is taking too long. ${this.getCircuitBreakerFallback(toolName)}`,
    };
  }

  private getCircuitBreakerFallback(toolName: string): any {
    const breaker = this.circuitBreakers.get(toolName);
    return {
      fallback: true,
      circuitBreaker: true,
      message: breaker?.getFallbackMessage() || "I'm having trouble reaching that service right now. Could we try again in a moment?",
    };
  }

  getFallbackMessage(toolName: string): string {
    const breaker = this.circuitBreakers.get(toolName);
    return breaker?.getFallbackMessage() || "I'm having trouble reaching that service right now.";
  }
}

export class HallucinationChecker {
  private numberPattern = /\b\d+(?:[.,]\d+)?\b/g;
  private datePattern = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
  private idPattern = /\b[A-Z]{2,}\d{4,}\b/g;
  private currencyPattern = /\$\d+(?:[.,]\d+)?/g;
  private phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;

  check(llmText: string, toolResult: any): { passed: boolean; mismatches: string[] } {
    const mismatches: string[] = [];
    const toolValues = this._extractValues(toolResult);

    for (const [patternName, pattern] of [
      ['number', this.numberPattern],
      ['date', this.datePattern],
      ['id', this.idPattern],
      ['currency', this.currencyPattern],
      ['phone', this.phonePattern],
    ] as const) {
      const llmMatches = llmText.match(pattern) || [];
      const toolMatches = toolValues[patternName] || [];

      for (const match of llmMatches) {
        const normalized = this._normalize(match, patternName);
        const toolNormalized = toolMatches.map(m => this._normalize(m, patternName));
        if (!toolNormalized.includes(normalized)) {
          mismatches.push(`${patternName}: '${match}' not found in tool result`);
        }
      }
    }

    return { passed: mismatches.length === 0, mismatches };
  }

  private _normalize(value: string, patternName: string): string {
    switch (patternName) {
      case 'number':
        return value.replace(/[,.]/g, '');
      case 'date':
        return value.replace(/\//g, '-');
      case 'currency':
        return value.replace(/[$,]/g, '');
      case 'phone':
        return value.replace(/\D/g, '');
      default:
        return value;
    }
  }

  private _extractValues(obj: any): Record<string, string[]> {
    const values: Record<string, string[]> = {
      number: [], date: [], id: [], currency: [], phone: [],
    };

    const extract = (obj: any) => {
      if (obj === null || obj === undefined) return;
      if (typeof obj === 'string') {
        values.number.push(...obj.match(this.numberPattern) || []);
        values.date.push(...obj.match(this.datePattern) || []);
        values.id.push(...obj.match(this.idPattern) || []);
        values.currency.push(...obj.match(this.currencyPattern) || []);
        values.phone.push(...obj.match(this.phonePattern) || []);
      } else if (typeof obj === 'number') {
        values.number.push(obj.toString());
      } else if (Array.isArray(obj)) {
        obj.forEach(extract);
      } else if (typeof obj === 'object') {
        Object.values(obj).forEach(extract);
      }
    };

    extract(obj);
    return values;
  }
}

export class StreamingToolExecutor {
  private executor: ToolExecutorImpl;

  constructor(executor: ToolExecutorImpl) {
    this.executor = executor;
  }

  async executeAndStream(
    toolName: string,
    arguments_: Record<string, unknown>,
    onFiller?: (text: string) => Promise<void>,
    onResult?: (result: any) => Promise<void>
  ): Promise<any> {
    const [result, usedFiller, usedFallback] = await this.executor.execute(
      toolName,
      arguments_,
      onFiller
    );

    const toolResult = {
      toolName,
      success: !usedFallback,
      result,
      usedFiller,
      usedFallback,
      latencyMs: 0,
    };

    if (onResult) {
      await onResult({ toolName, success: !usedFallback, result });
    }

    return { success: !usedFallback, result, usedFiller, usedFallback, latencyMs: 0 };
  }
}

export interface CustomToolDef {
  name: string;
  label?: string;
  description: string;
  parameters: any;
  execution_type?: 'mock' | 'webhook';
  mock_response?: string;
  webhook_url?: string;
  handler?: (args: any) => Promise<any>;
  is_custom?: boolean;
}

const customToolsStore: Map<string, CustomToolDef> = new Map();

// Helper to register a custom tool
export function registerCustomTool(tool: CustomToolDef): void {
  const handler = async (args: any) => {
    if (tool.execution_type === 'webhook' && tool.webhook_url) {
      try {
        const res = await axios.post(tool.webhook_url, args, { timeout: 8000 });
        return res.data;
      } catch (err: any) {
        return { error: `Webhook failed: ${err.message}` };
      }
    }
    // Mock response handler
    if (tool.mock_response) {
      try {
        const parsed = JSON.parse(tool.mock_response);
        return { ...parsed, ...args };
      } catch {
        return { result: tool.mock_response, ...args };
      }
    }
    return { status: 'success', executed: tool.name, args };
  };

  customToolsStore.set(tool.name, {
    ...tool,
    is_custom: true,
    handler,
  });
}

export function deleteCustomTool(name: string): boolean {
  return customToolsStore.delete(name);
}

export function getCustomTools(): CustomToolDef[] {
  return Array.from(customToolsStore.values());
}

// Pre-register an example custom tool: check_order
registerCustomTool({
  name: 'check_order',
  label: '📦 Order Status Tracker',
  description: 'Lookup order delivery status, items, and tracking details by order ID',
  parameters: {
    type: 'object',
    properties: {
      order_id: { type: 'string', description: 'Order ID or number, e.g. ORD-8821' },
    },
    required: ['order_id'],
  },
  execution_type: 'mock',
  mock_response: JSON.stringify({
    status: 'Out for Delivery',
    carrier: 'FedEx Express',
    estimated_delivery: 'Today by 5:00 PM',
    items_count: 2,
    destination: 'Los Angeles, CA',
  }),
});

// Demo Tools
export function createDemoTools(): Map<string, any> {
  const tools = new Map();

  tools.set('get_weather', {
    name: 'get_weather',
    label: '🌤️ Live Weather',
    description: 'Get current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name or location' },
      },
      required: ['location'],
    },
    handler: async (args: { location: string }) => {
      await new Promise(r => setTimeout(r, 800));
      return {
        location: args.location,
        temperature: 72,
        condition: 'sunny',
        humidity: 45,
      };
    },
  });

  tools.set('check_booking', {
    name: 'check_booking',
    label: '📋 Booking Lookup',
    description: 'Check booking status by ID',
    parameters: {
      type: 'object',
      properties: {
        booking_id: { type: 'string', description: 'Booking reference ID' },
      },
      required: ['booking_id'],
    },
    handler: async (args: { booking_id: string }) => {
      await new Promise(r => setTimeout(r, 1200));
      return {
        booking_id: args.booking_id,
        status: 'confirmed',
        date: '2024-12-25',
        time: '14:30',
        party_size: 4,
      };
    },
  });

  tools.set('transfer_call', {
    name: 'transfer_call',
    label: '📞 Call Transfer',
    description: 'Transfer call to a department',
    parameters: {
      type: 'object',
      properties: {
        department: { type: 'string', description: 'Department name' },
      },
      required: ['department'],
    },
    handler: async (args: { department: string }) => {
      await new Promise(r => setTimeout(r, 500));
      return {
        transferred_to: args.department,
        estimated_wait: '2 minutes',
      };
    },
  });

  tools.set('transfer_to_human', {
    name: 'transfer_to_human',
    label: '👤 Transfer to Human Agent',
    description: 'Instantly escalates and transfers the caller to a human supervisor or specialist',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for escalation or handoff' },
        urgency: { type: 'string', enum: ['normal', 'high', 'urgent'], description: 'Urgency level' },
        department: { type: 'string', description: 'Target department or specialist queue' },
      },
      required: ['reason'],
    },
    handler: async (args: { reason: string; urgency?: string; department?: string }) => {
      await new Promise(r => setTimeout(r, 400));
      return {
        status: 'escalated',
        reason: args.reason,
        department: args.department || 'Tier 2 Support',
        message: 'A human supervisor has been notified and is stepping in immediately.',
      };
    },
  });

  return tools;
}

export function getAllToolsMap(): Map<string, any> {
  const all = createDemoTools();
  customToolsStore.forEach((tool, name) => {
    all.set(name, tool);
  });
  return all;
}