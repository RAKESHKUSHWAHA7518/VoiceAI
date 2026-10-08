// Comprehensive test suite for VoiceAI
import config from '../src/config';
import { validate, schemas } from '../src/middleware/validation';
import { asyncHandler } from '../src/middleware/errorHandler';
import { VoiceAIError, ValidationError, AuthenticationError, NotFoundError } from '../src/types';
import { SileroVAD, MockVAD } from '../src/services/vad';
import { MockASR } from '../src/services/asr';
import { MockTTS } from '../src/services/tts';
import { MockLLM } from '../src/services/llm';
import { ToolRegistryImpl, CircuitBreakerImpl, ToolExecutorImpl, HallucinationChecker, StreamingToolExecutor } from '../src/services/tools';
import { SessionManager } from '../src/services/session';

describe('Configuration', () => {
  test('should load default config', () => {
    expect(config.env).toBe('test');
    expect(config.port).toBe(8000);
    expect(config.vad.threshold).toBe(0.6);
  });
});

describe('Error Classes', () => {
  test('VoiceAIError should have correct properties', () => {
    const error = new VoiceAIError('Test error', 'TEST_ERROR', 400, { detail: 'test' });
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ detail: 'test' });
  });

  test('ValidationError should have correct defaults', () => {
    const error = new ValidationError('Validation failed', { field: 'email' });
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  test('AuthenticationError should have 401 status', () => {
    const error = new AuthenticationError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('AUTHENTICATION_ERROR');
  });

  test('NotFoundError should have 404 status', () => {
    const error = new NotFoundError('Resource');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Resource not found');
  });
});

describe('Validation Middleware', () => {
  test('should validate required fields', async () => {
    const schema = require('zod').object({
      body: require('zod').object({
        name: require('zod').string().min(1),
        email: require('zod').string().email(),
      }),
    });

    const validator = validate(schema);
    const mockReq: any = { body: { name: 'Test', email: 'invalid-email' }, get: jest.fn() };
    const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const mockNext: any = jest.fn();

    await expect(validator(mockReq, mockRes, mockNext)).rejects.toThrow();
  });

  test('should have createSession schema', () => {
    expect(schemas.createSession).toBeDefined();
  });
});

describe('VAD Service', () => {
  test('MockVAD should initialize', () => {
    const vad = new MockVAD(0.6);
    expect(vad).toBeDefined();
    expect(vad.getState()).toBe('idle');
  });

  test('MockVAD should detect speech', async () => {
    const vad = new MockVAD(0.6);
    vad.setSpeechProbabilities([0.9, 0.1, 0.1, 0.1]);
    
    const chunk = new Float32Array(480);
    const result1 = await vad.processChunk(chunk);
    expect(result1.isSpeech).toBe(true);
    
    const result2 = await vad.processChunk(chunk);
    expect(result2.isSpeech).toBe(false);
  });

  test('SileroVAD should initialize', () => {
    const vad = new SileroVAD(0.6, 16000);
    expect(vad).toBeDefined();
    expect(vad.getState()).toBe('idle');
  });
});

describe('ASR Services', () => {
  test('MockASR should work', async () => {
    const asr = new MockASR();
    await asr.connect();
    
    asr.injectTranscript('Hello world');
    const transcript = await asr.getTranscript();
    
    expect(transcript.text).toBe('Hello world');
    expect(transcript.isFinal).toBe(true);
  });
});

describe('TTS Services', () => {
  test('MockTTS should work', async () => {
    const tts = new MockTTS();
    await tts.connect();
    
    const chunks: any[] = [];
    for await (const chunk of tts.receiveAudio()) {
      chunks.push(chunk);
      if (chunks.length >= 2) break;
    }
    
    expect(chunks.length).toBeGreaterThan(0);
    await tts.close();
  });
});

describe('LLM Services', () => {
  test('MockLLM should stream responses', async () => {
    const llm = new MockLLM();
    llm.setResponses(['Hello world', 'How can I help?']);
    
    const chunks: any[] = [];
    for await (const chunk of llm.streamChat([], 'Hello')) {
      chunks.push(chunk);
    }
    
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some(c => c.content)).toBe(true);
  });
});

describe('Tool System', () => {
  test('ToolRegistry should register and retrieve tools', () => {
    const registry = new ToolRegistryImpl();
    
    const tool = {
      name: 'test_tool',
      description: 'Test tool',
      parameters: { type: 'object', properties: {} },
      handler: async (): Promise<any> => ({ 
        toolCallId: 'test', 
        success: true, 
        result: 'ok', 
        latencyMs: 10,
        usedFallback: false 
      }),
    };
    
    registry.register(tool);
    expect(registry.get('test_tool')).toBeDefined();
    expect(registry.getSchema()).toHaveLength(1);
  });

  test('CircuitBreaker should work', async () => {
    const breaker = new CircuitBreakerImpl(2, 1000);
    
    await expect(breaker.call(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(breaker.call(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(breaker.call(async () => 'success')).rejects.toThrow('Circuit breaker open');
  });

  test('ToolExecutor should execute tools', async () => {
    const registry = new ToolRegistryImpl();
    const executor = new ToolExecutorImpl(registry);
    
    const mockTool = {
      name: 'test',
      description: 'Test',
      parameters: {},
      handler: async (args: any): Promise<any> => ({ 
        toolCallId: 'test', 
        success: true, 
        result: { result: args.value * 2 }, 
        latencyMs: 10,
        usedFallback: false 
      }),
    };
    
    // Register tool manually for test
    (registry as any).tools.set('test', mockTool);
    
    const [result, usedFiller, usedFallback] = await executor.execute('test', { value: 5 });
    expect(result.result).toBe(10);
    expect(usedFiller).toBe(false);
    expect(usedFallback).toBe(false);
  });

  test('CircuitBreaker should open after threshold', async () => {
    const breaker = new CircuitBreakerImpl(2, 1000);
    
    await expect(breaker.call(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(breaker.call(async () => { throw new Error('fail'); })).rejects.toThrow();
    
    await expect(breaker.call(async () => 'success')).rejects.toThrow('Circuit breaker open');
  });
});

describe('HallucinationChecker', () => {
  test('should detect hallucinated numbers', () => {
    const checker = new HallucinationChecker();
    const toolResult = { temperature: 72, date: '2024-12-25', booking_id: 'ABC12345' };
    
    let result = checker.check('The temperature is 72 degrees on 2024-12-25. Your booking ABC12345 is confirmed.', toolResult);
    expect(result.passed).toBe(true);
    
    result = checker.check('The temperature is 100 degrees.', toolResult);
    expect(result.passed).toBe(false);
    expect(result.mismatches.some((m: string) => m.includes('number'))).toBe(true);
  });

  test('should detect hallucinated dates', () => {
    const checker = new HallucinationChecker();
    const toolResult = { date: '2024-12-25' };
    
    const result = checker.check('The date is 2025-01-01.', toolResult);
    expect(result.passed).toBe(false);
  });

  test('should handle currency', () => {
    const checker = new HallucinationChecker();
    const toolResult = { price: '$29.99' };
    
    const result = checker.check('The price is $100.', toolResult);
    expect(result.passed).toBe(false);
  });
});

describe('Session Management', () => {
  test('SessionManager should create and manage sessions', () => {
    const manager = new SessionManager();
    const session = manager.createSession('test-session', 'user-1');
    
    expect(session.sessionId).toBe('test-session');
    expect(session.userId).toBe('user-1');
    expect(session.state).toBe('idle');
    
    manager.updateSessionState('test-session', 'listening');
    const updated = manager.getSession('test-session');
    expect(updated?.state).toBe('listening');
    
    manager.endSession('test-session');
    const ended = manager.getSession('test-session');
    expect(ended?.state).toBe('ended');
  });

  test('SessionManager should track turn history', () => {
    const manager = new SessionManager();
    manager.createSession('test-session');
    
    manager.addTurn('test-session', { turnId: 'turn_1', userTranscript: 'Hello' });
    manager.addTurn('test-session', { turnId: 'turn_2', userTranscript: 'World' });
    
    const history = manager.getTurnHistory('test-session');
    expect(history.length).toBe(2);
    expect(history[0].turnId).toBe('turn_1');
    expect(history[1].turnId).toBe('turn_2');
  });

  test('SessionManager should provide metrics', () => {
    const manager = new SessionManager();
    manager.createSession('test-session');
    
    manager.addTurn('test-session', { 
      turnId: 'turn_1', 
      vadMs: 50, 
      asrMs: 200, 
      ttftMs: 300, 
      ttsFirstChunkMs: 150,
      e2eMs: 700,
      interruptionCount: 0,
      toolCalls: [],
    });
    
    const metrics = manager.getSessionMetrics('test-session');
    expect(metrics).not.toBeNull();
    expect(metrics!.totalTurns).toBe(1);
    expect(metrics!.avgE2eMs).toBe(700);
  });
});

describe('AsyncHandler', () => {
  test('should catch async errors', async () => {
    const mockReq: any = { get: jest.fn() };
    const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const mockNext: any = jest.fn();
    
    const asyncFn = asyncHandler(async (req: any, res: any, next: any) => {
      throw new Error('Test error');
    });
    
    await asyncFn(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('Rate Limiter', () => {
  test('should allow requests under limit', async () => {
    const { rateLimiter } = require('../src/middleware/rateLimiter');
    
    const limiter = rateLimiter({ windowMs: 1000, maxRequests: 5 });
    const mockReq: any = { ip: '127.0.0.1', headers: {}, get: jest.fn() };
    const mockRes: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const mockNext: any = jest.fn();
    
    for (let i = 0; i < 5; i++) {
      await limiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(i + 1);
    }
  });
});

describe('Call History & Post-Call Analytics', () => {
  test('should retrieve call history and analyze a completed call', async () => {
    const request = require('supertest');
    const app = require('../src/app').default;

    // 1. GET /api/calls
    const getRes = await request(app).get('/api/calls');
    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(Array.isArray(getRes.body.calls)).toBe(true);
    expect(getRes.body.calls.length).toBeGreaterThanOrEqual(1);

    // 2. POST /api/calls/analyze with conversation
    const analyzeRes = await request(app)
      .post('/api/calls/analyze')
      .send({
        agentId: 'agent_support',
        agentName: 'Maya',
        agentRole: 'Customer Support Lead',
        durationSeconds: 45,
        messages: [
          { role: 'assistant', text: 'Hello, how can I assist you with your booking today?' },
          { role: 'user', text: 'Please check my booking BK-101 and status.' },
          { role: 'assistant', text: 'Your booking BK-101 is confirmed for 4 guests. Thank you!' }
        ]
      });

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.success).toBe(true);
    const record = analyzeRes.body.record || analyzeRes.body.call;
    expect(record).toBeDefined();
    expect(record.summary).toBeDefined();
    expect(record.sentiment).toBeDefined();
    expect(record.qa_scores).toBeDefined();
    expect(record.qa_scores.overall_score).toBeGreaterThan(0);
    expect(record.transcripts.length).toBe(3);

    // 3. GET /api/calls/:id
    const singleRes = await request(app).get(`/api/calls/${record.id}`);
    expect(singleRes.status).toBe(200);
    expect(singleRes.body.call.id).toBe(record.id);

    // 4. Clean up: DELETE /api/calls/:id
    const delRes = await request(app).delete(`/api/calls/${record.id}`);
    expect(delRes.status).toBe(200);
  });
});