import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { TTSProvider, TTSChunk } from '../types';
import config from '../config';
import * as crypto from 'crypto';

export class CartesiaTTS extends EventEmitter implements TTSProvider {
  private client: AxiosInstance;
  private apiKey: string;
  private voiceId: string;
  private modelId: string;
  private sampleRate: number;
  private ws: WebSocket | null = null;
  private connected = false;
  private audioQueue: Buffer[] = [];
  private isProcessing = false;

  constructor(
    apiKey: string,
    voiceId?: string,
    modelId: string = 'sonic-3.6',
    sampleRate: number = 24000
  ) {
    super();
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://api.cartesia.ai',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Cartesia-Version': '2024-06-10',
      },
      timeout: 30000,
    });
    this.voiceId = voiceId || 'a0e99841-438c-4a64-b679-ae501e7d6091';
    this.modelId = modelId;
    this.sampleRate = sampleRate;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.cartesia.ai/tts/websocket?api_key=${this.apiKey}&cartesia_version=2024-06-10`;
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        this.connected = true;
        this.emit('connected');
        this.processQueue();
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'chunk' && message.data) {
            const audioBytes = Buffer.from(message.data, 'base64');
            this.emit('audio', {
              audioBytes: audioBytes,
              isFinal: message.done || false,
              sampleRate: this.sampleRate,
            });
          } else if (message.type === 'done') {
            this.emit('audio', {
              audioBytes: Buffer.alloc(0),
              isFinal: true,
              sampleRate: this.sampleRate,
            });
          } else if (message.type === 'error') {
            const errorMsg = message.error || message.message || 'Cartesia TTS error';
            console.warn('[Cartesia] Received error:', errorMsg);
            if (this.listenerCount('error') > 0) {
              this.emit('error', new Error(errorMsg));
            }
          }
        } catch (error) {
          console.error('Cartesia message parse error:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('Cartesia WebSocket error:', error);
        if (this.listenerCount('error') > 0) {
          this.emit('error', error);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      setTimeout(() => {
        if (!this.connected) {
          this.ws?.close();
          reject(new Error('Cartesia connection timeout'));
        }
      }, 10000);
    });
  }

  private processQueue(): void {
    if (this.isProcessing || this.audioQueue.length === 0) return;
    this.isProcessing = true;
    const chunk = this.audioQueue.shift()!;
    this.sendText(chunk.toString(), false).catch((err) => console.warn('Queue sendText error:', err));
    this.isProcessing = false;
    if (this.audioQueue.length > 0) this.processQueue();
  }

  async sendText(text: string, flush: boolean = false): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected to Cartesia');
    }
    const contextId = `ctx_${Date.now()}`;
    this.ws.send(JSON.stringify({
      context_id: contextId,
      model_id: this.modelId,
      transcript: text,
      voice: {
        mode: 'id',
        id: this.voiceId,
      },
      output_format: {
        container: 'raw',
        encoding: 'pcm_s16le',
        sample_rate: this.sampleRate,
      },
      continue: !flush,
    }));
  }

  async *receiveAudio(): AsyncGenerator<{ audioBytes: Buffer; isFinal: boolean; sampleRate: number }> {
    const queue: any[] = [];
    let resolved = false;
    let resolveNext: (value: any) => void;
    let rejectNext: (err: Error) => void;

    const nextPromise = () => new Promise((resolve, reject) => {
      resolveNext = resolve;
      rejectNext = reject;
    });

    const handler = (chunk: any) => {
      if (resolved) {
        queue.push(chunk);
      } else {
        resolved = true;
        resolveNext(chunk);
      }
    };

    this.on('audio', handler);

    try {
      while (true) {
        const chunk: any = await nextPromise();
        yield chunk;
      }
    } finally {
      this.off('audio', handler);
    }
  }

  async close(): Promise<void> {
    if (this.ws && this.connected) {
      this.ws.close();
      this.connected = false;
    }
  }
}

export class ElevenLabsTTS extends EventEmitter implements TTSProvider {
  private client: AxiosInstance;
  private voiceId: string;
  private modelId: string;
  private sampleRate: number;
  private ws: WebSocket | null = null;
  private connected = false;

  constructor(
    apiKey: string,
    voiceId?: string,
    modelId: string = 'eleven_turbo_v2_5',
    sampleRate: number = 24000
  ) {
    super();
    this.client = axios.create({
      baseURL: 'https://api.elevenlabs.io',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    this.voiceId = voiceId || '21m00Tcm4TlvDq8ikWAM';
    this.modelId = modelId;
    this.sampleRate = sampleRate;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${this.modelId}&output_format=pcm_24000`;
      const apiKey = String(this.client.defaults.headers['xi-api-key'] || '');
      this.ws = new WebSocket(url, {
        headers: { 'xi-api-key': apiKey },
      });

      this.ws.on('open', () => {
        this.connected = true;
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.audio) {
            const audioBytes = Buffer.from(message.audio, 'base64');
            this.emit('audio', {
              audioBytes,
              isFinal: message.isFinal || false,
              sampleRate: this.sampleRate,
            });
          }
        } catch (error) {
          console.error('ElevenLabs message parse error:', error);
        }
      });

      this.ws.on('error', (error: any) => {
        this.emit('error', error);
      });

      this.ws.on('close', () => {
        this.connected = false;
      });

      setTimeout(() => {
        if (!this.connected) {
          this.ws?.close();
          reject(new Error('ElevenLabs connection timeout'));
        }
      }, 10000);
    });
  }

  async sendText(text: string, flush: boolean = false): Promise<void> {
    if (!this.connected || !this.ws) throw new Error('Not connected');
    this.ws.send(JSON.stringify({ text, try_trigger_generation: flush }));
  }

  async *receiveAudio(): AsyncGenerator<{ audioBytes: Buffer; isFinal: boolean; sampleRate: number }> {
    // Similar to Cartesia
    const queue: any[] = [];
    let resolved = false;
    let resolveNext: (value: any) => void;
    let rejectNext: (err: Error) => void;

    const nextPromise = () => new Promise((resolve, reject) => {
      resolveNext = resolve;
      rejectNext = reject;
    });

    const handler = (chunk: any) => {
      if (resolved) queue.push(chunk);
      else { resolved = true; resolveNext(chunk); }
    };

    this.on('audio', handler);
    try {
      while (true) {
        const chunk: any = await new Promise((resolve, reject) => {
          resolveNext = resolve;
          rejectNext = reject;
        });
        yield chunk;
      }
    } finally {
      this.off('audio', handler);
    }
  }

  async close(): Promise<void> {
    if (this.ws && this.connected) {
      await this.ws.close();
      this.connected = false;
    }
  }
}

export class MockTTS extends EventEmitter {
  private connected = false;
  private sampleRate: number;
  private chunkDurationMs: number;

  constructor(sampleRate: number = 24000, chunkDurationMs: number = 100) {
    super();
    this.sampleRate = sampleRate;
    this.chunkDurationMs = chunkDurationMs;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async sendText(text: string, flush: boolean = false): Promise<void> {
    if (!this.connected) throw new Error('Not connected');
    // Generate silence as mock audio
    const samples = Math.floor(this.sampleRate * this.chunkDurationMs / 1000);
    const silence = Buffer.alloc(samples * 2);
    this.emit('audio', {
      audioBytes: silence,
      isFinal: flush,
      sampleRate: this.sampleRate,
    });
  }

  async *receiveAudio(): AsyncIterable<{ audioBytes: Buffer; isFinal: boolean; sampleRate: number }> {
    yield { audioBytes: Buffer.alloc(0), isFinal: true, sampleRate: this.sampleRate };
  }

  async close(): Promise<void> {
    this.connected = false;
  }
}

export class TTSFactory {
  static create(config: {
    provider: 'cartesia' | 'elevenlabs' | 'kokoro' | 'mock';
    apiKey?: string;
    voiceId?: string;
    modelId?: string;
    sampleRate?: number;
  }): any {
    switch (config.provider) {
      case 'cartesia':
        if (!config.apiKey) throw new Error('Cartesia API key required');
        return new CartesiaTTS(config.apiKey, config.voiceId, config.modelId, config.sampleRate);
      case 'elevenlabs':
        if (!config.apiKey) throw new Error('ElevenLabs API key required');
        return new ElevenLabsTTS(config.apiKey, config.voiceId, config.modelId, config.sampleRate);
      case 'kokoro':
        // Kokoro would be implemented here
        console.warn('Kokoro TTS not fully implemented, using mock');
        return new MockTTS();
      case 'mock':
      default:
        return new MockTTS();
    }
  }
}