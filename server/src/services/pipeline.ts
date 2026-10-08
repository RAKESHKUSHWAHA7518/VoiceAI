import { EventEmitter } from 'events';
import { TurnContext, TurnMetrics, TranscriptSegment, SessionState } from '../types';
import { SileroVAD, MockVAD } from './vad';
import { DeepgramASR, MockASR } from './asr';
import { OpenAILLM, MockLLM } from './llm';
import { CartesiaTTS, ElevenLabsTTS, MockTTS } from './tts';
import { ToolRegistryImpl, ToolExecutorImpl, StreamingToolExecutor, HallucinationChecker, createDemoTools } from './tools';
import { sessionManager, SessionStateMachine } from './session';
import { getLangfuseClient, LatencyContext } from '../telemetry/latency_spans';
import { create_control_frame, parse_frame, ControlType, FrameType } from '../transport/ws_protocol';
import { float32_to_pcm16, pcm16_to_float32, resample_audio } from '../audio/utils';
import config from '../config';
import logger from '../utils/logger';

export interface PipelineComponents {
  vad: any;
  asr: any;
  llm: any;
  tts: any;
  toolRegistry: any;
  toolExecutor: any;
  streamingToolExecutor: any;
  hallucinationChecker: any;
  sessionManager: any;
}

export async function createPipelineComponents(connectProviders: boolean = false): Promise<PipelineComponents> {
  const vad = process.env.VAD_MODEL_PATH 
    ? new SileroVAD(config.vad.threshold, config.audio.sampleRate)
    : new MockVAD(config.vad.threshold);

  const asr = config.apiKeys?.deepgram 
    ? new DeepgramASR(config.apiKeys.deepgram)
    : new MockASR();

  if (connectProviders && config.apiKeys?.deepgram) {
    try {
      await asr.connect();
    } catch {
      // Ignore connection failure in tests/fallback
    }
  }

  const llm = config.apiKeys?.openai
    ? new OpenAILLM(config.apiKeys.openai)
    : new MockLLM();

  let tts: any;
  const ttsProvider = (config.tts?.provider || 'mock').toLowerCase();
  if (ttsProvider === 'cartesia' && config.apiKeys?.cartesia) {
    tts = new CartesiaTTS(config.apiKeys.cartesia);
  } else if (ttsProvider === 'elevenlabs' && config.apiKeys?.elevenlabs) {
    tts = new ElevenLabsTTS(config.apiKeys.elevenlabs);
  } else {
    tts = new MockTTS();
  }
  if (connectProviders) {
    try {
      await tts.connect();
    } catch {
      // Ignore connection failure in tests/fallback
    }
  }

  const toolRegistry = new ToolRegistryImpl();
  // Register demo tools
  const demoTools = createDemoTools();
  for (const [name, tool] of demoTools.entries()) {
    toolRegistry.register(tool);
  }

  const toolExecutor = new ToolExecutorImpl(toolRegistry);
  const streamingToolExecutor = new StreamingToolExecutor(toolExecutor);
  const hallucinationChecker = new HallucinationChecker();

  return {
    vad,
    asr,
    llm,
    tts,
    toolRegistry,
    toolExecutor,
    streamingToolExecutor,
    hallucinationChecker,
    sessionManager,
  };
}

export class PipelineOrchestrator extends EventEmitter {
  private components!: PipelineComponents;
  private activeSessions: Map<string, any> = new Map();

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    this.components = await createPipelineComponents();
    logger.info('Pipeline components initialized');
  }

  async createSession(sessionId: string, userId?: string): Promise<any> {
    return sessionManager.createSession(sessionId, userId);
  }

  async processTurn(
    sessionId: string,
    audioChunks: Buffer[],
    turnId?: string,
    langfuse?: any
  ): Promise<{ sequence: number; interrupted: boolean }> {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    return { sequence: 0, interrupted: false };
  }

  getSession(sessionId: string) {
    return sessionManager.getSession(sessionId);
  }

  async shutdown(): Promise<void> {
    if (this.components?.asr) await this.components.asr.close();
    if (this.components?.tts) await this.components.tts.close();
  }
}

export class TurnProcessor {
  constructor(
    private ws: any,
    private session: any,
    private components: any,
    private langfuse: any,
    private sequence: number
  ) {}

  async run(audioBuffer: Buffer[], turnId: string): Promise<void> {
    // Process turn audio
  }
}

export class PipelineManager extends EventEmitter {
  private orchestrator: PipelineOrchestrator;

  constructor() {
    super();
    this.orchestrator = new PipelineOrchestrator();
  }

  async initialize(): Promise<void> {
    await this.orchestrator.initialize();
  }

  async handleWebSocketConnection(ws: any, req: any): Promise<void> {
    // Handled via WebSocketHandler
  }

  async shutdown(): Promise<void> {
    await this.orchestrator.shutdown();
  }
}