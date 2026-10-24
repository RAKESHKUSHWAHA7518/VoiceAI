// Test setup file
import config from '../src/config';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.VOICEAI_RUNTIME_MODE = 'demo';
process.env.VOICEAI_SPEECH_MODE = 'browser';
// Existing simulator tests deliberately exercise the local legacy demo.
// Account isolation is tested separately without this bypass.
process.env.VOICEAI_LEGACY_DEMO = 'true';
process.env.LOG_LEVEL = 'error';

// Mock external services
jest.mock('onnxruntime-node', () => ({
  InferenceSession: {
    create: jest.fn().mockResolvedValue({
      run: jest.fn().mockResolvedValue([{ data: [0.1] }, new Float32Array(256), new Float32Array(256)]),
      inputNames: ['input', 'sr', 'h', 'c'],
    }),
  },
}));

// Mock services with async generators
jest.mock('../src/services/tts', () => ({
  MockTTS: class MockTTS {
    private connected = false;
    private sampleRate = 24000;
    
    constructor(sampleRate = 24000) {
      this.sampleRate = sampleRate;
    }
    
    async connect() { this.connected = true; }
    async sendText(text: string, flush = false) {}
    async *receiveAudio() { yield { audioBytes: Buffer.alloc(0), isFinal: true, sampleRate: this.sampleRate }; }
    async close() { this.connected = false; }
  },
  CartesiaTTS: class {},
  ElevenLabsTTS: class {},
  TTSFactory: { create: jest.fn() },
}));

jest.mock('../src/services/llm', () => ({
  MockLLM: class MockLLM {
    private responses: string[] = [];
    private index = 0;
    
    setResponses(responses: string[]) {
      this.responses = responses;
      this.index = 0;
    }
    
    async *streamChat() {
      const response = this.responses[this.index] || 'I understand.';
      this.index = (this.index + 1) % this.responses.length;
      const words = response.split(' ');
      for (const word of words) {
        yield { content: word + ' ', isToolCall: false, toolArgsComplete: false };
      }
    }
  },
  OpenAILLM: class {},
  GroqLLM: class {},
  GeminiLLM: class {},
  LLMFactory: { create: jest.fn() },
}));

jest.mock('../src/services/asr', () => ({
  MockASR: class MockASR {
    private queue: any[] = [];
    
    async connect() {}
    async sendAudio(audio: Buffer) {}
    async getTranscript() {
      return new Promise(resolve => {
        if (this.queue.length > 0) {
          resolve(this.queue.shift());
        } else {
          setTimeout(() => resolve({ text: '', isFinal: true, confidence: 0, start: 0, end: 0 }), 100);
        }
      });
    }
    injectTranscript(text: string, isFinal = true) {
      this.queue.push({ text, isFinal, confidence: 0.95, start: 0, end: 1 });
    }
    async close() {}
  },
  DeepgramASR: class {},
  FasterWhisperASR: class {},
  ASRFactory: { create: jest.fn() },
}));

jest.mock('../src/services/tools', () => {
  class ToolRegistryImpl {
    private tools = new Map();
    register(tool: any) { this.tools.set(tool.name, tool); }
    get(name: string) { return this.tools.get(name); }
    getAll() { return Array.from(this.tools.values()); }
    getSchema() { return Array.from(this.tools.values()).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })); }
    getHandler(name: string) { return this.tools.get(name)?.handler; }
    has(name: string) { return this.tools.has(name); }
  }
  
  class CircuitBreakerImpl {
    private failureCount = 0;
    private lastFailureTime = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';
    constructor(private failureThreshold = 3, private timeout = 30000) {}
    async call(fn: () => Promise<any>) {
      if (this.state === 'open') {
        if (Date.now() - this.lastFailureTime > this.timeout) this.state = 'half-open';
        else throw new Error('Circuit breaker open');
      }
      try {
        const result = await fn();
        if (this.state === 'half-open') { this.state = 'closed'; this.failureCount = 0; }
        return result;
      } catch (error) {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.failureThreshold) this.state = 'open';
        throw error;
      }
    }
    isOpen() { return this.state === 'open'; }
    getState() { return this.state; }
    getFallbackMessage() { return 'Service unavailable'; }
  }
  
  class ToolExecutorImpl {
    constructor(private registry: any) {}
    async execute(toolName: string, args: any) {
      const handler = this.registry.getHandler(toolName);
      if (!handler) throw new Error(`Tool not found: ${toolName}`);
      const result = await handler(args);
      // Return just the result value, not the full object
      return [result.result || result, false, false];
    }
  }
  
  class HallucinationChecker {
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
        case 'number': return value.replace(/[,.]/g, '');
        case 'date': return value.replace(/\//g, '-');
        case 'currency': return value.replace(/[$,]/g, '');
        case 'phone': return value.replace(/\D/g, '');
        default: return value;
      }
    }

    private _extractValues(obj: any): Record<string, string[]> {
      const values: Record<string, string[]> = { number: [], date: [], id: [], currency: [], phone: [] };

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
  
  class StreamingToolExecutor {
    constructor(private executor: any) {}
    async executeAndStream() { return { success: true, result: {}, usedFiller: false, usedFallback: false, latencyMs: 0 }; }
  }

  const mockToolsMap = new Map();
    mockToolsMap.set('transfer_to_human', {
      name: 'transfer_to_human',
      label: '👤 Transfer to Human Agent',
      description: 'Instantly escalates and transfers the caller to a human supervisor',
      parameters: { type: 'object', properties: { reason: { type: 'string' } } },
    });
    mockToolsMap.set('check_availability', {
      name: 'check_availability',
      label: '📅 Calendar Availability',
      description: 'Check open calendar appointment slots for a specific date',
      parameters: { type: 'object', properties: { date: { type: 'string' } } },
      handler: async (args: any) => {
        const { calendarManager } = require('../src/services/calendar');
        const res = calendarManager.getAvailableSlots(args.date);
        return { date: res.date, available_slots: res.slots, total_open: res.slots.length };
      },
    });
    mockToolsMap.set('book_appointment', {
      name: 'book_appointment',
      label: '📝 Book Appointment',
      description: 'Reserve an appointment slot for the customer',
      parameters: {
        type: 'object',
        properties: { customer_name: { type: 'string' }, time: { type: 'string' } },
        required: ['customer_name', 'time'],
      },
      handler: async (args: any) => {
        const { calendarManager } = require('../src/services/calendar');
        const apt = await calendarManager.bookAppointment(args);
        return {
          status: 'confirmed',
          confirmation_code: apt.id,
          appointment_date: apt.date,
          appointment_time: apt.time,
          customer_name: apt.customer_name,
        };
      },
    });
    const getAllToolsMap = () => mockToolsMap;

    return { ToolRegistryImpl, CircuitBreakerImpl, ToolExecutorImpl, HallucinationChecker, StreamingToolExecutor, getAllToolsMap, createDemoTools: () => jest.requireActual('../src/services/tools').createDemoTools() };
  });

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    eval: jest.fn().mockResolvedValue([1, 1]),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  }));
});

jest.mock('ws', () => {
  return {
    WebSocket: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1,
    })),
    WebSocketServer: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      clients: new Set(),
      close: jest.fn(),
    })),
  };
});

// Global test timeout
jest.setTimeout(10000);

// Suppress console logs during tests unless explicitly testing logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities
interface TestUtils {
  createMockRequest: (overrides?: Record<string, unknown>) => {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
    query: Record<string, string>;
    params: Record<string, string>;
    ip: string;
  };
  createMockResponse: () => {
    status: jest.Mock;
    json: jest.Mock;
    send: jest.Mock;
    setHeader: jest.Mock;
    getHeader: jest.Mock;
    removeHeader: jest.Mock;
  };
  waitFor: (ms: number) => Promise<void>;
}

declare global {
  var testUtils: {
    createMockRequest: (overrides?: Record<string, unknown>) => {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: Record<string, unknown>;
      query: Record<string, string>;
      params: Record<string, string>;
      ip: string;
    };
    createMockResponse: () => {
      status: jest.Mock;
      json: jest.Mock;
      send: jest.Mock;
      setHeader: jest.Mock;
      getHeader: jest.Mock;
      removeHeader: jest.Mock;
    };
    waitFor: (ms: number) => Promise<void>;
  };
}

global.testUtils = {
  createMockRequest: (overrides: Record<string, unknown> = {}) => ({
    method: 'GET',
    url: '/',
    headers: {},
    body: {},
    query: {},
    params: {},
    ip: '127.0.0.1',
    ...overrides,
  }),
  createMockResponse: () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      removeHeader: jest.fn(),
    };
    return res;
  },
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};
