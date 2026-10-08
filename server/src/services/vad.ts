import { EventEmitter } from 'events';
import { VADProvider, VadResult, VadState } from '../types';
import config from '../config';
import * as ort from 'onnxruntime-node';
import * as fs from 'fs';
import * as path from 'path';

export class SileroVAD extends EventEmitter implements VADProvider {
  private session: ort.InferenceSession | null = null;
  private threshold: number;
  private sampleRate: number;
  private chunkSize: number;
  private hiddenState: Float32Array;
  private cellState: Float32Array;
  private state: VadState = 'idle';
  private speechChunkCount = 0;
  private silenceChunkCount = 0;
  private sosRequiredChunks: number;
  private eosRequiredChunks: number;
  private utteranceStarted = false;
  private bargeInDetected = false;

  constructor(
    threshold: number = config.vad.threshold,
    sampleRate: number = config.audio.sampleRate,
    modelPath?: string
  ) {
    super();
    this.threshold = threshold;
    this.sampleRate = sampleRate;
    this.chunkSize = Math.floor(sampleRate * 0.03); // 30ms chunks
    this.hiddenState = new Float32Array(2 * 1 * 128);
    this.cellState = new Float32Array(2 * 1 * 128);
    
    this.sosRequiredChunks = Math.max(1, Math.floor(config.vad.sosDebounceMs / 30));
    this.eosRequiredChunks = Math.max(1, Math.floor(config.vad.eosTimeoutMs / 30));
    
    this.initialize(modelPath);
  }

  private async initialize(modelPath?: string): Promise<void> {
    try {
      const modelPath = path.resolve(
        process.env.VAD_MODEL_PATH || 
        path.join(__dirname, '../../models/silero_vad.onnx')
      );
      
      if (!fs.existsSync(modelPath)) {
        console.warn(`VAD model not found at ${modelPath}, using mock`);
        return;
      }
      
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });
    } catch (error) {
      console.error('Failed to initialize VAD:', error);
    }
  }

  reset(): void {
    this.hiddenState.fill(0);
    this.cellState.fill(0);
    this.state = 'idle';
    this.speechChunkCount = 0;
    this.silenceChunkCount = 0;
    this.utteranceStarted = false;
    this.bargeInDetected = false;
  }

  resetForBargeIn(): void {
    this.hiddenState.fill(0);
    this.cellState.fill(0);
    this.state = 'idle';
    this.speechChunkCount = 0;
    this.silenceChunkCount = 0;
    this.utteranceStarted = false;
    this.bargeInDetected = true;
  }

  forceInterrupt(): void {
    this.bargeInDetected = true;
    this.emit('bargeIn');
  }

  getState(): VadState {
    return this.state;
  }

  getSpeechDurationMs(): number {
    if (!this.utteranceStarted) return 0;
    return Date.now() - this.utteranceStartTime;
  }

  private utteranceStartTime = 0;

  async processChunk(chunk: Float32Array): Promise<VadResult> {
    if (!this.session) {
      // Mock implementation for testing
      const isSpeech = Math.random() > 0.5;
      return {
        speechProb: isSpeech ? 0.9 : 0.1,
        isSpeech,
        state: this.state,
        timestamp: Date.now(),
      };
    }

    if (chunk.length !== this.chunkSize) {
      throw new Error(`Expected ${this.chunkSize} samples, got ${chunk.length}`);
    }

    const { Tensor } = require('onnxruntime-node');
    const inputTensor = new Tensor('float32', chunk, [1, chunk.length]);
    const srTensor = new Tensor('int64', BigInt64Array.from([BigInt(this.sampleRate)]), [1]);
    const hTensor = new Tensor('float32', this.hiddenState, [2, 1, 64]);
    const cTensor = new Tensor('float32', this.cellState, [2, 1, 64]);

    const feeds: Record<string, any> = {
      [this.session!.inputNames[0] || 'input']: inputTensor,
      [this.session!.inputNames[1] || 'sr']: srTensor,
      [this.session!.inputNames[2] || 'h']: hTensor,
      [this.session!.inputNames[3] || 'c']: cTensor,
    };

    const results: any = await this.session!.run(feeds);
    const speechProb = Number(results[0]?.data?.[0] ?? results.output?.data?.[0] ?? 0);
    if (results[1]?.data) this.hiddenState = results[1].data as Float32Array;
    if (results[2]?.data) this.cellState = results[2].data as Float32Array;

    const isSpeech = speechProb >= this.threshold;
    const currentTime = Date.now();

    let event: VadResult['state'] | null = null;

    switch (this.state) {
      case 'idle':
        if (isSpeech) {
          this.state = 'speech_debounce';
          this.speechChunkCount = 1;
          this.utteranceStartTime = currentTime;
        } else {
          this.speechChunkCount = 0;
        }
        break;

      case 'speech_debounce':
        if (isSpeech) {
          this.speechChunkCount++;
          if (this.speechChunkCount >= this.sosRequiredChunks) {
            this.state = 'in_speech';
            this.utteranceStarted = true;
            this.emit('speechStart', { timestamp: currentTime });
          }
        } else {
          this.state = 'idle';
          this.speechChunkCount = 0;
        }
        break;

      case 'in_speech':
        if (isSpeech) {
          this.silenceChunkCount = 0;
        } else {
          this.state = 'silence_debounce';
          this.silenceChunkCount = 1;
        }
        break;

      case 'silence_debounce':
        if (isSpeech) {
          this.state = 'in_speech';
          this.silenceChunkCount = 0;
        } else {
          this.silenceChunkCount++;
          const dynamicEos = this.calculateDynamicEosTimeout();
          const requiredChunks = Math.max(1, Math.floor(dynamicEos / 30));
          
          if (this.silenceChunkCount >= requiredChunks) {
            this.state = 'utterance_end';
            this.emit('speechEnd', { timestamp: currentTime });
          }
        }
        break;

      case 'utterance_end':
        if (isSpeech) {
          this.reset();
          return this.processChunk(chunk); // Recursive call for new utterance
        }
        break;
    }

    // Check for barge-in
    if (this.bargeInDetected && isSpeech && this.state === 'idle') {
      this.bargeInDetected = false;
      this.state = 'in_speech';
      this.utteranceStarted = true;
      this.utteranceStartTime = currentTime;
      this.emit('bargeIn', { timestamp: currentTime });
      return {
        speechProb,
        isSpeech: true,
        state: 'in_speech',
        timestamp: currentTime,
      };
    }

    return {
      speechProb,
      isSpeech,
      state: this.state,
      timestamp: currentTime,
    };
  }

  private calculateDynamicEosTimeout(): number {
    // Simple heuristic: faster speech = shorter timeout
    // This would be enhanced with actual speech rate estimation
    return 500; // Default 500ms
  }

  async processPcm16(pcm16: Buffer): Promise<VadResult> {
    const float32 = new Float32Array(pcm16.length / 2);
    const view = new DataView(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
    for (let i = 0; i < pcm16.length / 2; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }
    return this.processChunk(float32);
  }
}

export class MockVAD extends EventEmitter implements VADProvider {
  private state: VadState = 'idle';
  private threshold: number;
  private speechProbabilities: number[] = [];
  private probabilityIndex = 0;

  constructor(threshold: number = 0.6) {
    super();
    this.threshold = threshold;
  }

  setSpeechProbabilities(probs: number[]): void {
    this.speechProbabilities = probs;
    this.probabilityIndex = 0;
  }

  reset(): void {
    this.state = 'idle';
    this.probabilityIndex = 0;
  }

  resetForBargeIn(): void {
    this.state = 'idle';
  }

  forceInterrupt(): void {
    this.emit('bargeIn');
  }

  getState(): VadState {
    return this.state;
  }

  async processChunk(chunk: Float32Array): Promise<VadResult> {
    const prob = this.speechProbabilities[this.probabilityIndex] ?? 0;
    this.probabilityIndex = (this.probabilityIndex + 1) % this.speechProbabilities.length;
    
    const isSpeech = prob >= this.threshold;
    const currentTime = Date.now();
    let event: VadState | null = null;

    if (isSpeech && this.state === 'idle') {
      this.state = 'in_speech';
      event = 'in_speech';
    } else if (!isSpeech && this.state === 'in_speech') {
      this.state = 'idle';
      event = 'idle';
    }

    return {
      speechProb: prob,
      isSpeech,
      state: this.state,
      timestamp: Date.now(),
    };
  }
}