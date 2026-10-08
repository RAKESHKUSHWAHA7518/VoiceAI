// ============================================================================
// Frame Protocol Utilities
// ============================================================================

import { FRAME_TYPES } from '../types';

export interface ControlFrame {
  type: string;
  payload: Record<string, unknown>;
}

export interface ParsedFrame {
  frameType: number;
  sequence: number;
  payload: Uint8Array;
}

export function createControlFrame(type: string, payload: Record<string, unknown>, sequence: number): Uint8Array {
  const payloadBytes = new TextEncoder().encode(JSON.stringify({ type, payload }));
  const frame = new Uint8Array(9 + payloadBytes.length);
  frame[0] = FRAME_TYPES.CONTROL;
  new DataView(frame.buffer).setUint32(1, sequence, false);
  new DataView(frame.buffer).setUint32(5, payloadBytes.length, false);
  frame.set(payloadBytes, 9);
  return frame;
}

export function parseFrame(data: ArrayBuffer): ParsedFrame | null {
  if (data.byteLength < 9) return null;
  const view = new DataView(data);
  const frameType = view.getUint8(0);
  const sequence = view.getUint32(1, false);
  const payloadLen = view.getUint32(5, false);
  if (data.byteLength < 9 + payloadLen) return null;
  return { frameType, sequence, payload: new Uint8Array(data.slice(9, 9 + payloadLen)) };
}

export function parseControlFrame(data: ArrayBuffer): ControlFrame | null {
  const parsed = parseFrame(data);
  if (!parsed || parsed.frameType !== FRAME_TYPES.CONTROL) return null;
  
  try {
    const payload = new TextDecoder().decode(parsed.payload);
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function isAudioFrame(frameType: number): boolean {
  return frameType === FRAME_TYPES.AUDIO;
}

export function isControlFrame(frameType: number): boolean {
  return frameType === FRAME_TYPES.CONTROL;
}

export function isPingFrame(frameType: number): boolean {
  return frameType === FRAME_TYPES.PING;
}

export function isPongFrame(frameType: number): boolean {
  return frameType === FRAME_TYPES.PONG;
}