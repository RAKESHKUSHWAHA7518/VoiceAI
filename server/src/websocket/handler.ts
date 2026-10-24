import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import crypto from 'crypto';
import { parse_frame, FrameType, ControlType, create_control_frame, create_audio_frame } from '../transport/ws_protocol';
import { PipelineOrchestrator } from '../services/pipeline';
import { SessionStateMachine } from '../services/session';
import { getLangfuseClient, LatencyContext } from '../telemetry/latency_spans';
import { float32_to_pcm16, pcm16_to_float32, resample_audio } from '../audio/utils';
import config from '../config';
import logger from '../utils/logger';
import { legacyDemo } from '../middleware/workspace';

interface SessionData {
  sessionId: string;
  session: SessionStateMachine;
  components: any;
  langfuse: any;
  sequence: number;
  audioBuffer: Buffer[];
  isSpeaking: boolean;
}

const activeSessions = new Map<string, SessionData>();

export class WebSocketHandler {
  private orchestrator: any;
  private wss: WebSocketServer;

  constructor(server: any, noServer = false) {
    this.wss = new WebSocketServer(noServer ? { noServer: true, verifyClient: () => legacyDemo() } : { server, path: '/ws', verifyClient: () => legacyDemo() });
    this.initialize();
  }

  public getWss(): WebSocketServer {
    return this.wss;
  }

  private initialize(): void {
    this.wss.on('connection', (ws: any, req: IncomingMessage) => this.handleConnection(ws, req));
  }

  private async handleConnection(ws: any, req: IncomingMessage): Promise<void> {
    const sessionId = crypto.randomUUID().slice(0, 8);
    const session = new SessionStateMachine(sessionId);
    const langfuse = getLangfuseClient();

    // Initialize pipeline components
    const { createPipelineComponents } = require('../services/pipeline');
    const components = await createPipelineComponents(true);

    const sessionData: SessionData = {
      sessionId,
      session,
      components,
      langfuse,
      sequence: 0,
      audioBuffer: [],
      isSpeaking: false,
    };

    activeSessions.set(sessionId, sessionData);

    logger.info(`Session ${sessionId} connected`);

    // Send session start control frame
    ws.send(create_control_frame('session_start', { sessionId, session_id: sessionId }, 0));

    session.startSession();

    ws.on('message', async (data: Buffer) => {
      try {
        await this.handleMessage(ws, sessionId, data);
      } catch (error) {
        logger.error('Error handling message', { error });
      }
    });

    ws.on('close', async () => {
      await this.handleDisconnect(sessionId);
    });

    ws.on('error', (error: Error) => {
      logger.error('WebSocket error', { error, sessionId });
    });
  }

  private async handleMessage(ws: any, sessionId: string, data: Buffer): Promise<void> {
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) return;

    const { session, components, langfuse, audioBuffer } = sessionData;

    try {
      const parsed = parse_frame(data);
      if (!parsed) return;

      const [frameType, seq, payload] = parsed;

      if (frameType === FrameType.AUDIO) {
        // Real-time VAD processing for barge-in detection
        const vadResult = components.vad.process_pcm16(payload);
        
        if (vadResult[1] === 'barge_in') {
          logger.info('Barge-in detected via VAD', { sessionId });
          session.interrupt();
          components.vad.reset_for_barge_in();
          await ws.send(create_control_frame(ControlType.FLUSH_BUFFER, {}, sessionData.sequence));
          sessionData.sequence++;
          audioBuffer.length = 0;
          // Recreate TTS to clear any pending audio
          await components.tts.close();
          components.tts = await this.recreateTTS(components);
          return;
        }

        if (vadResult[1] === 'start_of_speech') {
          logger.debug('Start of speech detected', { sessionId });
          sessionData.isSpeaking = true;
          session.start_speaking();
        } else if (vadResult[1] === 'end_of_speech') {
          logger.debug('End of speech detected', { sessionId });
          sessionData.isSpeaking = false;
          if (audioBuffer.length > 0) {
            const turnId = `turn_${Date.now()}`;
            const processor = new (require('../services/pipeline').TurnProcessor)(
              ws, session, components, langfuse, sessionData.sequence
            );
            processor.run([...audioBuffer], turnId).catch((err: any) => {
              logger.error('Error in VAD TurnProcessor run:', err);
            });
            audioBuffer.length = 0;
          }
        }

        audioBuffer.push(payload);
      } else if (frameType === FrameType.CONTROL) {
        try {
          const control = JSON.parse(payload.toString('utf-8'));
          const ctype = control.type;

          if (ctype === ControlType.START_SPEAKING) {
            sessionData.isSpeaking = true;
            session.start_speaking();
          } else if (ctype === ControlType.STOP_SPEAKING) {
            if (audioBuffer.length > 0) {
              const turnId = `turn_${Date.now()}`;
              const processor = new (require('../services/pipeline').TurnProcessor)(
                ws, session, components, langfuse, sessionData.sequence
              );
              await processor.run(audioBuffer, turnId);
              audioBuffer.length = 0;
            }
          } else if (ctype === 'interrupt') {
            session.interrupt();
            components.vad.force_interrupt();
            await ws.send(create_control_frame(ControlType.FLUSH_BUFFER, {}, sessionData.sequence));
            sessionData.sequence++;
            audioBuffer.length = 0;
            await components.tts.close();
            components.tts = await this.recreateTTS(components);
          } else if (ctype === 'rewind') {
            const turnIndex = Number(control.turnIndex ?? control.turn_index ?? 0);
            const { sessionManager } = require('../services/session');
            const rewindResult = sessionManager.rewindToTurn(sessionId, turnIndex);
            await ws.send(create_control_frame(ControlType.FLUSH_BUFFER, {}, sessionData.sequence));
            sessionData.sequence++;
            audioBuffer.length = 0;
            await ws.send(create_control_frame('session_rewound', { turnIndex, rewindResult }, sessionData.sequence));
            sessionData.sequence++;
          } else if (ctype === 'ping') {
            await ws.send(create_control_frame('pong', {}, sessionData.sequence));
          }
        } catch (error) {
          logger.warn('Invalid control frame', { error });
        }
      }
    } catch (error) {
      logger.error('Error handling message', { error });
    }
  }

  private async recreateTTS(components: any) {
    const ttsProvider = (config.tts?.provider || 'mock').toLowerCase();
    let tts;
    if (ttsProvider === 'cartesia' && config.apiKeys?.cartesia) {
      tts = new (require('../services/tts').CartesiaTTS)(config.apiKeys.cartesia);
    } else if (ttsProvider === 'elevenlabs' && config.apiKeys?.elevenlabs) {
      tts = new (require('../services/tts').ElevenLabsTTS)(config.apiKeys.elevenlabs);
    } else {
      tts = new (require('../services/tts').MockTTS)();
    }
    try {
      await tts.connect();
    } catch {
      tts = new (require('../services/tts').MockTTS)();
    }
    return tts;
  }

  private async handleDisconnect(sessionId: string): Promise<void> {
    const sessionData = activeSessions.get(sessionId);
    if (sessionData) {
      await sessionData.components.asr.close();
      await sessionData.components.tts.close();
      sessionData.session.end_session();
      activeSessions.delete(sessionId);
      logger.info(`Session ${sessionId} disconnected`);
    }
  }
}

export function createWebSocketServer(server: any): WebSocketHandler {
  return new WebSocketHandler(server);
}
