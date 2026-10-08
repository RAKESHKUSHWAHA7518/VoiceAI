import { Buffer } from 'buffer';

export const SAMPLE_RATE = 16000;
export const CHANNELS = 1;
export const CHUNK_MS = 30;
export const CHUNK_SAMPLES = Math.floor(SAMPLE_RATE * CHUNK_MS / 1000);
export const FRAME_SIZE = CHUNK_SAMPLES * 2; // 16-bit = 2 bytes

export function pcm16_to_float32(pcm16: Buffer): Float32Array {
  if (pcm16.length % 2 !== 0) {
    pcm16 = pcm16.slice(0, -1);
  }
  const arr = new Int16Array(pcm16.buffer, pcm16.byteOffset, pcm16.length / 2);
  const floatArr = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    floatArr[i] = arr[i] / 32768.0;
  }
  return floatArr;
}

export function float32_to_pcm16(floatArr: Float32Array): Buffer {
  const clamped = new Float32Array(floatArr.length);
  for (let i = 0; i < floatArr.length; i++) {
    clamped[i] = Math.max(-1, Math.min(1, floatArr[i]));
  }
  const pcm16 = new Int16Array(clamped.length);
  for (let i = 0; i < clamped.length; i++) {
    pcm16[i] = Math.round(clamped[i] * 32767);
  }
  return Buffer.from(pcm16.buffer);
}

export function resample_audio(
  audio: Float32Array,
  origSr: number,
  targetSr: number = 16000
): Float32Array {
  if (origSr === targetSr) return audio;
  
  const ratio = targetSr / origSr;
  const newLength = Math.round(audio.length * ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i / (targetSr / origSr);
    const idx = Math.floor(srcIndex);
    const frac = srcIndex - idx;
    
    if (idx + 1 < audio.length) {
      result[i] = audio[idx] * (1 - frac) + audio[idx + 1] * frac;
    } else {
      result[i] = audio[idx];
    }
  }
  
  return result;
}

export function mulaw_encode(pcm16: Buffer): Buffer {
  const pcm = new Int16Array(pcm16.buffer, pcm16.byteOffset, pcm16.length / 2);
  const mu = 255;
  const encoded = new Uint8Array(pcm.length);
  
  for (let i = 0; i < pcm.length; i++) {
    const sample = pcm[i] / 32768;
    const sign = sample >= 0 ? 1 : -1;
    const magnitude = Math.log1p(mu * Math.abs(sample)) / Math.log1p(mu);
    const val = sign * magnitude * 127 + 128;
    encoded[i] = Math.round(val) ^ 128; // μ-law bias
  }
  return Buffer.from(encoded.buffer);
}

export function mulaw_decode(mulaw: Buffer): Buffer {
  const encoded = new Uint8Array(mulaw.buffer, mulaw.byteOffset, mulaw.length);
  const mu = 255;
  const decoded = new Int16Array(encoded.length);
  
  for (let i = 0; i < encoded.length; i++) {
    let sample = encoded[i] ^ 128; // Remove bias
    sample = sample - 128;
    const sign = sample >= 0 ? 1 : -1;
    const magnitude = Math.abs(sample) / 128;
    const val = sign * (Math.exp(Math.abs(sample) / 128 * Math.log(1 + 255)) - 1) / 255 * 32767;
    decoded[i] = Math.round(Math.max(-32768, Math.min(32767, val)));
  }
  return Buffer.from(decoded.buffer);
}

export function alaw_encode(pcm16: Buffer): Buffer {
  const pcm = new Int16Array(pcm16.buffer, pcm16.byteOffset, pcm16.length / 2);
  const A = 87.6;
  const encoded = new Uint8Array(pcm.length);
  
  for (let i = 0; i < pcm.length; i++) {
    const sample = pcm[i] / 32768;
    const sign = sample >= 0 ? 1 : -1;
    const magnitude = Math.abs(sample);
    let compressed;
    if (magnitude < 1 / A) {
      compressed = sign * A * magnitude / (1 + Math.log(A));
    } else {
      compressed = sign * (1 + Math.log(A * magnitude)) / (1 + Math.log(A));
    }
    encoded[i] = Math.round((compressed + 1) * 127.5);
  }
  return Buffer.from(encoded.buffer);
}

export function alaw_decode(alaw: Buffer): Buffer {
  const encoded = new Uint8Array(alaw.buffer, alaw.byteOffset, alaw.length);
  const A = 87.6;
  const decoded = new Int16Array(encoded.length);
  
  for (let i = 0; i < encoded.length; i++) {
    const sample = encoded[i] / 127.5 - 1;
    const sign = sample >= 0 ? 1 : -1;
    const magnitude = Math.abs(sample);
    let pcm;
    if (magnitude < 1 / (1 + Math.log(A))) {
      pcm = sign * magnitude * (1 + Math.log(A)) / A;
    } else {
      pcm = sign * (Math.exp(magnitude * (1 + Math.log(A)) - 1) / A);
    }
    decoded[i] = Math.round(Math.max(-32768, Math.min(32767, pcm * 32767)));
  }
  return Buffer.from(decoded.buffer);
}

export function get_audio_chunk_size(
  sampleRate: number = 16000,
  chunkMs: number = 30,
  channels: number = 1
): number {
  const samples = Math.floor(sampleRate * chunkMs / 1000);
  return samples * channels * 2;
}

export function split_pcm16_chunks(pcm16: Buffer, chunkSize: number = 960): Buffer[] {
  const chunks: Buffer[] = [];
  for (let i = 0; i < pcm16.length; i += chunkSize) {
    chunks.push(pcm16.slice(i, i + chunkSize));
  }
  return chunks;
}