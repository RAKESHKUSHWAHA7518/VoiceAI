// Core Type Definitions

export interface AudioChunk {
  data: Buffer;
  sampleRate: number;
  channels: number;
  timestamp: number;
  sequence: number;
}

export interface TranscriptSegment {
  text: string;
  isFinal: boolean;
  confidence: number;
  start: number;
  end: number;
  words?: WordTiming[];
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface VadResult {
  speechProb: number;
  isSpeech: boolean;
  state: VadState;
  timestamp: number;
}

export type VadState = 'idle' | 'speech_debounce' | 'in_speech' | 'silence_debounce' | 'utterance_end';

export interface TurnContext {
  turnId: string;
  sessionId: string;
  userTranscript: string;
  interimTranscript: string;
  llmTokens: string[];
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  ttsChunksSent: number;
  cancelled: boolean;
  interrupted: boolean;
  interruptedAtToken: number;
  preservedContext: string;
  startTime: number;
  endTime?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export interface ToolResult {
  toolCallId?: string;
  toolName?: string;
  success: boolean;
  result?: any;
  error?: string | null;
  latencyMs: number;
  usedFallback?: boolean;
  usedFiller?: boolean;
}

export interface SessionState {
  sessionId: string;
  userId?: string;
  state: SessionStateType;
  currentTurn?: TurnContext;
  turnHistory: TurnContext[];
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export type SessionStateType = 
  | 'idle' 
  | 'listening' 
  | 'processing' 
  | 'speaking' 
  | 'interrupted' 
  | 'ended';

export interface AudioMetrics {
  vadMs: number;
  asrMs: number;
  ttftMs: number;
  ttsFirstChunkMs: number;
  e2eMs: number;
  toolExecMs: number;
  ttsStreamingMs: number;
  interruptionCount: number;
}

export interface TurnMetrics {
  turnId: string;
  sessionId: string;
  vadMs: number;
  asrMs: number;
  ttftMs: number;
  ttsFirstChunkMs: number;
  e2eMs: number;
  toolExecMs: number;
  ttsStreamingMs: number;
  interruptionCount: number;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface SessionMetrics {
  sessionId: string;
  totalTurns: number;
  avgVadMs: number;
  avgAsrMs: number;
  avgTtftMs: number;
  avgTtsFirstChunkMs: number;
  avgE2eMs: number;
  totalInterruptions: number;
  interruptionRate: number;
  toolCallsCount: number;
  toolSuccessRate: number;
  overallScore: number;
}

// WebSocket Frame Types
export enum FrameType {
  AUDIO = 0x01,
  CONTROL = 0x02,
  PING = 0x03,
  PONG = 0x04,
}

export enum ControlType {
  START_SPEAKING = 'start_speaking',
  STOP_SPEAKING = 'stop_speaking',
  INTERRUPT = 'interrupt',
  FLUSH_BUFFER = 'flush_buffer',
  PING = 'ping',
  PONG = 'pong',
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  ERROR = 'error',
  TRANSCRIPT = 'transcript',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  CONFIG_UPDATE = 'config_update',
  VAD_EVENT = 'vad_event',
}

export interface ControlFrame {
  type: string;
  payload: Record<string, unknown>;
  sequence: number;
}

export interface AudioFrame {
  data: Buffer;
  sequence: number;
  timestamp: number;
}

// Tool Definitions
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// LLM Types
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface LLMStreamChunk {
  content?: string;
  toolCalls?: Partial<ToolCall>[];
  finishReason?: string;
}

// TTS Types
export interface TTSChunk {
  audioBytes: Buffer;
  isFinal: boolean;
  sampleRate: number;
}

export interface TTSProvider {
  connect(): Promise<void>;
  sendText(text: string, flush?: boolean): Promise<void>;
  receiveAudio(): AsyncIterable<TTSChunk>;
  close(): Promise<void>;
}

// ASR Types
export interface ASRProvider {
  connect(): Promise<void>;
  sendAudio(audio: Buffer): Promise<void>;
  getTranscript(): Promise<TranscriptSegment>;
  close(): Promise<void>;
}

// VAD Types
export interface VADProvider {
  processChunk(chunk: Float32Array): Promise<VadResult>;
  reset(): void;
  forceInterrupt(): void;
  getState(): VadState;
}

// Session Types
export interface SessionConfig {
  sessionId: string;
  userId?: string;
  config: {
    vadThreshold: number;
    sosDebounceMs: number;
    eosTimeoutMs: number;
    llmModel: string;
    llmTemperature: number;
    ttsProvider: string;
    ttsVoiceId: string;
    systemPrompt: string;
  };
}

// Error Types
export class VoiceAIError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VoiceAIError';
  }
}

export class ValidationError extends VoiceAIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends VoiceAIError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends VoiceAIError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends VoiceAIError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends VoiceAIError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
  }
}

export class ProviderError extends VoiceAIError {
  constructor(
    message: string,
    public provider: string,
    public originalError?: Error
  ) {
    super(message, 'PROVIDER_ERROR', 502, { provider });
    this.name = 'ProviderError';
  }
}

// LLM Types
export interface LLMProvider {
  streamChat(
    history: any[],
    userText: string,
    tools?: any[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): AsyncGenerator<any>;
}

// Tool Types
export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  getSchema(): any[];
  getHandler(name: string): Function | undefined;
  has(name: string): boolean;
}

export interface CircuitBreaker {
  call<T>(fn: () => Promise<any>): Promise<any>;
  isOpen(): boolean;
  getState(): string;
  getFallbackMessage(): string;
}

export interface ToolExecutor {
  execute(
    toolName: string,
    args: Record<string, unknown>,
    onFiller?: (text: string) => Promise<void>
  ): Promise<[any, boolean, boolean]>;
}

export type ToolExecutorType = ToolExecutor;

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
}

export interface HallucinationChecker {
  check(llmText: string, toolResult: any): { passed: boolean; mismatches: string[] };
}

export interface StreamingToolExecutor {
  executeAndStream(
    toolName: string,
    args: Record<string, unknown>,
    onFiller?: (text: string) => Promise<void>,
    onResult?: (result: any) => Promise<void>
  ): Promise<any>;
}