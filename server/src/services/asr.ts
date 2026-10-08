import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { TranscriptSegment, ASRProvider } from '../types';
import config from '../config';
import * as fs from 'fs';
import * as path from 'path';

export class DeepgramASR extends EventEmitter implements ASRProvider {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private model: string;
  private language: string;
  private sampleRate: number;
  private encoding: string;
  private channels: number;
  private interimResults: boolean;
  private punctuate: boolean;
  private smartFormat: boolean;
  private connected = false;
  private transcriptQueue: TranscriptSegment[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private keepAliveInterval?: NodeJS.Timeout;

  constructor(
    apiKey: string,
    model: string = 'nova-2',
    language: string = 'en',
    sampleRate: number = 16000,
    encoding: string = 'linear16',
    channels: number = 1
  ) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.language = language;
    this.sampleRate = sampleRate;
    this.encoding = encoding;
    this.channels = channels;
    this.interimResults = true;
    this.punctuate = true;
    this.smartFormat = true;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const url = 'wss://api.deepgram.com/v1/listen';
    const params = new URLSearchParams({
      model: this.model,
      language: this.language,
      sample_rate: this.sampleRate.toString(),
      encoding: this.encoding,
      channels: this.channels.toString(),
      interim_results: this.interimResults.toString(),
      punctuate: this.punctuate.toString(),
      smart_format: this.smartFormat.toString(),
      vad_events: 'true',
      endpointing: '300',
    });

    return new Promise((resolve, reject) => {
      const urlWithParams = `${url}?${params.toString()}`;
      
      this.ws = new WebSocket(urlWithParams, {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });

      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startKeepAlive();
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse Deepgram message:', error);
        }
      });

      this.ws.on('error', (error: any) => {
        console.error('Deepgram WebSocket error:', error);
        this.stopKeepAlive();
        this.emit('error', error);
      });

      this.ws.on('close', (code: any, reason: any) => {
        this.connected = false;
        this.stopKeepAlive();
        this.handleClose(code, reason ? reason.toString() : '');
      });

      // Set connection timeout
      setTimeout(() => {
        if (!this.connected) {
          this.stopKeepAlive();
          this.ws?.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    const sendPing = () => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
        } catch {
          // Socket may be transitioning
        }
      }
    };
    // Send immediately so Deepgram sees traffic right after handshake
    sendPing();
    this.keepAliveInterval = setInterval(sendPing, 3000);
    this.keepAliveInterval.unref();
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = undefined;
    }
  }

  private handleMessage(data: any): void {
    if (data.type === 'Results') {
      const channel = data.channel;
      if (!channel?.alternatives?.length) return;

      const alt = channel.alternatives[0];
      const transcript = alt.transcript;
      if (!transcript) return;

      const isFinal = data.is_final === true;
      const confidence = alt.confidence || 0;
      const words = alt.words || [];

      const segment: TranscriptSegment = {
        text: transcript,
        isFinal,
        confidence,
        start: words[0]?.start || 0,
        end: words[words.length - 1]?.end || 0,
        words: words.map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
        })),
      };

      this.emit('transcript', segment);
    } else if (data.type === 'SpeechStarted') {
      this.emit('speechStarted', data);
    } else if (data.type === 'UtteranceEnd') {
      this.emit('utteranceEnd', data);
    } else if (data.type === 'Error') {
      this.emit('error', new Error(data.message));
    } else if (data.type === 'Metadata') {
      this.emit('metadata', data);
    }
  }

  private handleClose(code: number, reason: string): void {
    this.connected = false;
    
    if (code !== 1000) {
      console.warn(`Deepgram connection closed: ${code} - ${reason}`);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    setTimeout(() => {
      this.connect().catch((err) => {
        console.error('Reconnection failed:', err);
      });
    }, delay);
  }

  async sendAudio(audio: Buffer): Promise<void> {
    if (this.connected && this.ws?.readyState === 1) {
      this.ws.send(audio);
    }
  }

  async getTranscript(): Promise<TranscriptSegment> {
    return new Promise((resolve) => {
      if (this.transcriptQueue.length > 0) {
        resolve(this.transcriptQueue.shift()!);
      } else {
        const handler = (segment: any) => {
          this.off('transcript', handler);
          resolve(segment);
        };
        this.once('transcript', handler);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          this.off('transcript', handler);
          resolve({
            text: '',
            isFinal: true,
            confidence: 0,
            start: 0,
            end: 0,
          });
        }, 5000);
      }
    });
  }

  async close(): Promise<void> {
    this.stopKeepAlive();
    if (this.ws) {
      this.ws.close(1000, 'Client closing');
      this.ws = null;
    }
    this.connected = false;
  }

  // Mock method for testing
  injectTranscript(text: string, isFinal: boolean = true): void {
    const segment: TranscriptSegment = {
      text,
      isFinal,
      confidence: 0.95,
      start: 0,
      end: 1,
    };
    this.emit('transcript', segment);
  }
}

export class MockASR {
  private queue: TranscriptSegment[] = [];

  async connect(): Promise<void> {}

  async sendAudio(audio: Buffer): Promise<void> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async getTranscript(): Promise<TranscriptSegment> {
    return new Promise((resolve) => {
      if (this.queue.length > 0) {
        resolve(this.queue.shift()!);
      } else {
        // Return empty transcript if queue is empty
        setTimeout(() => {
          resolve({
            text: '',
            isFinal: true,
            confidence: 0,
            start: 0,
            end: 0,
          });
        }, 100);
      }
    });
  }

  injectTranscript(text: string, isFinal: boolean = true): void {
    const segment: TranscriptSegment = {
      text,
      isFinal,
      confidence: 0.95,
      start: 0,
      end: 1,
    };
    this.queue.push(segment);
  }

  async close(): Promise<void> {}
}

export class FasterWhisperASR extends EventEmitter implements ASRProvider {
  private model: any = null;
  private sampleRate: number;
  private queue: TranscriptSegment[] = [];

  constructor(
    modelSize: string = 'base.en',
    device: string = 'cpu',
    computeType: string = 'int8',
    sampleRate: number = 16000
  ) {
    super();
    this.sampleRate = sampleRate;
  }

  async connect(): Promise<void> {
    try {
      // Dynamic import to avoid requiring faster-whisper if not installed
      const { WhisperModel } = require('faster-whisper');
      this.model = new WhisperModel('base.en', {
        device: 'cpu',
        computeType: 'int8',
      });
    } catch (error) {
      // faster-whisper not available, using mock
    }
  }

  async sendAudio(audio: Buffer): Promise<void> {
    if (!this.model) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return;
    }

    // Write to temp file and transcribe
    const tmpPath = `/tmp/voiceai_${Date.now()}.wav`;
    // Would write WAV header + audio data here
    // Then transcribe
  }

  async getTranscript(): Promise<TranscriptSegment> {
    return new Promise((resolve) => {
      if (this.queue.length > 0) {
        resolve(this.queue.shift()!);
      } else {
        setTimeout(() => resolve({
          text: '',
          isFinal: true,
          confidence: 0,
          start: 0,
          end: 0,
        }), 5000);
      }
    });
  }

  injectTranscript(text: string, isFinal: boolean = true): void {
    const segment: TranscriptSegment = {
      text,
      isFinal,
      confidence: 0.95,
      start: 0,
      end: 1,
    };
    this.queue.push(segment);
  }

  async close(): Promise<void> {}
}

export class ASRFactory {
  static create(config: {
    provider: 'deepgram' | 'whisper' | 'mock';
    apiKey?: string;
    model?: string;
    language?: string;
    sampleRate?: number;
  }): ASRProvider {
    switch (config.provider) {
      case 'deepgram':
        if (!config.apiKey) {
          console.warn('Deepgram API key not provided, using mock');
          return new MockASR();
        }
        return new DeepgramASR(
          config.apiKey,
          config.model || 'nova-2',
          config.language || 'en',
          config.sampleRate || 16000
        );
      case 'whisper':
        return new FasterWhisperASR();
      case 'mock':
      default:
        return new MockASR();
    }
  }
}