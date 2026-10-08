import { Buffer } from 'buffer';

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
  CONFIG_UPDATE = 'config_update',
  TRANSCRIPT = 'transcript',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
}

export interface ControlFrame {
  type: string;
  payload: Record<string, any>;
  sequence: number;
}

export function create_audio_frame(audio_bytes: Buffer, sequence: number = 0): Buffer {
  const header = Buffer.alloc(9);
  header[0] = 0x01; // AUDIO frame type
  header.writeUInt32BE(sequence, 1);
  header.writeUInt32BE(audio_bytes.length, 5);
  return Buffer.concat([header, audio_bytes]);
}

export function parse_audio_frame(data: Buffer): { sequence: number; payload: Buffer } | null {
  if (data.length < 9) return null;
  if (data[0] !== 0x01) return null;
  
  const sequence = data.readUInt32BE(1);
  const payload_len = data.readUInt32BE(5);
  if (data.length < 9 + payload_len) return null;
  
  return {
    sequence,
    payload: data.slice(9, 9 + payload_len),
  };
}

export function create_control_frame(
  control_type: string,
  payload: Record<string, any>,
  sequence: number = 0
): Buffer {
  const payload_bytes = Buffer.from(JSON.stringify({ type: control_type, payload }), 'utf8');
  const header = Buffer.alloc(9);
  header[0] = 0x02; // CONTROL frame type
  header.writeUInt32BE(0, 1); // sequence (not used for control)
  header.writeUInt32BE(payload_bytes.length, 5);
  return Buffer.concat([header, payload_bytes]);
}

export function parse_control_frame(data: Buffer): { type: string; payload: any; sequence: number } | null {
  if (data.length < 9) return null;
  if (data[0] !== 0x02) return null;
  
  const sequence = data.readUInt32BE(1);
  const payload_len = data.readUInt32BE(5);
  if (data.length < 9 + payload_len) return null;
  
  try {
    const payload = JSON.parse(data.slice(9, 9 + payload_len).toString('utf8'));
    return {
      type: payload.type,
      payload: payload.payload,
      sequence,
    };
  } catch {
    return null;
  }
}

export function parse_frame(data: Buffer): [number, number, Buffer] | null {
  if (data.length < 6) return null;
  
  const frame_type = data[0];
  const sequence = data.readUInt32BE(1);
  const payload_len = data.readUInt32BE(5);
  
  if (data.length < 6 + payload_len) return null;
  
  return [frame_type, sequence, data.slice(6, 6 + payload_len)];
}

export function create_ping_frame(sequence: number = 0): Buffer {
  const header = Buffer.alloc(6);
  header[0] = 0x03; // PING
  header.writeUInt32BE(sequence, 1);
  header.writeUInt32BE(0, 5);
  return header;
}

export function create_pong_frame(sequence: number = 0): Buffer {
  const header = Buffer.alloc(6);
  header[0] = 0x04; // PONG
  header.writeUInt32BE(sequence, 1);
  header.writeUInt32BE(0, 5);
  return header;
}