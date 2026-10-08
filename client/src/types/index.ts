// ============================================================================
// Types
// ============================================================================

export interface DashboardState {
  session_id: string | null;
  turn_id: string | null;
  transcript_count: number;
  barge_in_count: number;
  tool_calls_count: number;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  voice_id: string;
  voice_name?: string;
  llm_model: string;
  llm_temperature: number;
  system_prompt: string;
  assigned_tools: string[];
  greeting?: string;
  is_default?: boolean;
}

export interface PlaygroundConfig {
  voice_id: string;
  vad_threshold: number;
  vad_sos_debounce_ms: number;
  vad_eos_timeout_ms: number;
  system_prompt: string;
  llm_model: string;
  llm_temperature: number;
}

export interface PlaygroundTest {
  test_id: string;
  timestamp: number;
  input: string;
  config_snapshot: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  output?: string;
  latency_ms?: number;
  audio_url?: string;
  agent_id?: string;
  agent_name?: string;
  error?: string;
}

export interface TranscriptMsg {
  role: 'user' | 'assistant' | 'system';
  text: string;
  is_final: boolean;
  timestamp: number;
}

export interface BargeInEvent {
  timestamp: number;
}

export interface ToolCall {
  tool_name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'success' | 'fallback' | 'error';
  timestamp: number;
}

export interface MetricsData {
  vad_p50?: number;
  vad_p95?: number;
  asr_p50?: number;
  asr_p95?: number;
  ttft_p50?: number;
  ttft_p95?: number;
  tts_first_chunk_p50?: number;
  tts_first_chunk_p95?: number;
  e2e_p50?: number;
  e2e_p95?: number;
  interruption_rate?: number;
}

export type TabName = 'agents' | 'playground' | 'monitor' | 'inspector';

export const FRAME_TYPES = {
  AUDIO: 0x01,
  CONTROL: 0x02,
  PING: 0x03,
  PONG: 0x04,
} as const;

export const CONTROL_TYPES = {
  START_SPEAKING: 'start_speaking',
  STOP_SPEAKING: 'stop_speaking',
  INTERRUPT: 'interrupt',
  FLUSH_BUFFER: 'flush_buffer',
  PING: 'ping',
  PONG: 'pong',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  ERROR: 'error',
  TRANSCRIPT: 'transcript',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  CONFIG_UPDATE: 'config_update',
  VAD_EVENT: 'vad_event',
} as const;