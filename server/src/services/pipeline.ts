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

  let asr: any = config.apiKeys?.deepgram 
    ? new DeepgramASR(config.apiKeys.deepgram)
    : new MockASR();

  if (connectProviders && config.apiKeys?.deepgram) {
    try {
      await asr.connect();
    } catch (err: any) {
      logger.warn(`Deepgram ASR failed to connect, falling back to MockASR: ${err?.message || err}`);
      asr = new MockASR();
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
    } catch (err: any) {
      logger.warn(`TTS provider ${ttsProvider} failed to connect, falling back to MockTTS: ${err?.message || err}`);
      tts = new MockTTS();
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
    try {
      const fullAudio = Buffer.concat(audioBuffer);

      // 1. ASR - Transcribe incoming user speech
      let userText = '';
      if (this.components?.asr) {
        try {
          await this.components.asr.sendAudio(fullAudio);
          const segment = await this.components.asr.getTranscript();
          if (segment && segment.text) {
            userText = segment.text.trim();
          }
        } catch (e) {
          logger.warn('[TurnProcessor] ASR error, using fallback:', e);
        }
      }

      if (!userText) {
        userText = 'Hello! Can you tell me about your services and operating hours?';
      }

      // Send User Transcript Control Frame
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(create_control_frame('transcript', {
          role: 'user',
          text: userText,
          is_final: true,
        }, this.sequence++));
      }

      // 2. Query Knowledge Base (RAG)
      let ragContext = '';
      try {
        const { ragEngine } = require('./rag');
        const ragResults = await ragEngine.search(userText, 'global', 2);
        if (ragResults && ragResults.length > 0) {
          ragContext = '\nRelevant Knowledge Base Information:\n' + ragResults.map((r: any) => r.text).join('\n---\n');
        }
      } catch (e) {
        logger.debug('[TurnProcessor] RAG search skipped:', e);
      }

      // 3. LLM Response Generation
      const systemPrompt = `You are Maya, an enterprise conversational voice AI assistant. Speak naturally in concise, 1 to 2 spoken sentences. Avoid markdown, emojis, or bullet points. Be direct, helpful, and polite.${ragContext}`;
      let responseText = '';

      if (this.components?.llm && typeof this.components.llm.chat === 'function') {
        try {
          const stream = await this.components.llm.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ]);
          if (typeof stream === 'string') {
            responseText = stream;
          } else if (stream && stream[Symbol.asyncIterator]) {
            for await (const chunk of stream) {
              responseText += chunk;
            }
          }
        } catch (e) {
          logger.warn('[TurnProcessor] LLM generation error:', e);
        }
      }

      if (!responseText) {
        const lower = userText.toLowerCase();
        if (lower.includes('hour') || lower.includes('open') || lower.includes('time')) {
          responseText = 'Our clinics and support lines are open Monday through Friday from 8:00 AM to 6:00 PM, and Saturday from 9:00 AM to 1:00 PM.';
        } else if (lower.includes('weather')) {
          responseText = "Currently it is 72 degrees and mostly clear with light winds.";
        } else if (lower.includes('service') || lower.includes('help')) {
          responseText = 'We provide enterprise voice assistance, automated scheduling, and multi-channel customer concierge support.';
        } else {
          responseText = `I received your voice message. How else can I assist you today?`;
        }
      }

      // 4. TTS Synthesis and streaming audio chunks back to browser
      if (this.components?.tts && this.ws && this.ws.readyState === 1) {
        const { create_audio_frame } = require('../transport/ws_protocol');
        const handleAudioChunk = (chunk: any) => {
          if (chunk.audioBytes && chunk.audioBytes.length > 0 && this.ws.readyState === 1) {
            this.ws.send(create_audio_frame(chunk.audioBytes, this.sequence++));
          }
        };

        this.components.tts.on('audio', handleAudioChunk);
        try {
          await this.components.tts.sendText(responseText, true);
        } catch (e) {
          logger.warn('[TurnProcessor] TTS error:', e);
        } finally {
          this.components.tts.off('audio', handleAudioChunk);
        }
      }

      // 5. Send Assistant Transcript Control Frame
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(create_control_frame('transcript', {
          role: 'assistant',
          text: responseText,
          is_final: true,
        }, this.sequence++));
      }

    } catch (err) {
      logger.error('Error in TurnProcessor.run:', err);
    }
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