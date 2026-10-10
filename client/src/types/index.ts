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
  languages_supported?: string[];
  default_language?: string;
  auto_switch_language?: boolean;
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

export interface ToolItem {
  name: string;
  label?: string;
  description: string;
  parameters: {
    type?: string;
    properties?: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  execution_type?: 'mock' | 'webhook';
  mock_response?: string;
  webhook_url?: string;
  is_custom?: boolean;
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

export interface CallQAscore {
  overall_score: number;
  empathy: number;
  clarity: number;
  tool_accuracy: number;
  response_speed: number;
}

export interface CallAnalyticsRecord {
  id: string;
  session_id: string;
  agent_id: string;
  agent_name: string;
  agent_avatar?: string;
  agent_role: string;
  timestamp: number;
  duration_seconds: number;
  summary: string;
  sentiment: 'Positive' | 'Neutral' | 'Frustrated' | 'Curious';
  sentiment_score: number;
  resolution_status: 'Resolved' | 'Needs Follow-Up' | 'Escalated' | 'Unresolved';
  topics: string[];
  action_items: string[];
  qa_scores: CallQAscore;
  transcripts: Array<{
    role: string;
    text: string;
    timestamp?: string | number;
  }>;
  tool_calls_count: number;
  audio_url?: string;
}

export interface PhoneNumberRecord {
  id: string;
  phone_number: string;
  friendly_name: string;
  agent_id: string;
  agent_name: string;
  agent_avatar?: string;
  status: 'active' | 'inactive';
  inbound_calls_count: number;
  last_call_at?: number;
  created_at: number;
}

export interface KnowledgeDocument {
  id: string;
  agent_id: string;
  title: string;
  filename: string;
  file_type: 'pdf' | 'md' | 'txt' | 'json' | 'csv';
  file_size: number;
  created_at: number;
  chunk_count: number;
  status: 'indexed' | 'indexing' | 'error';
  error?: string;
}

export interface KnowledgeChunk {
  id: string;
  doc_id: string;
  agent_id: string;
  chunk_index: number;
  text: string;
  metadata: {
    title: string;
    filename: string;
    token_count: number;
  };
}

export interface KnowledgeSearchResult {
  chunk_id: string;
  doc_id: string;
  title: string;
  filename: string;
  text: string;
  score: number;
  latency_ms: number;
}

export interface HITLTranscriptItem {
  id: string;
  role: 'user' | 'assistant' | 'supervisor';
  text: string;
  timestamp: number;
  sentiment?: 'Positive' | 'Neutral' | 'Frustrated';
}

export interface CopilotSuggestion {
  id: string;
  text: string;
  category: 'deescalation' | 'policy' | 'action' | 'greeting';
  confidence: number;
}

export interface HITLActiveCall {
  id: string;
  session_id: string;
  agent_id: string;
  agent_name: string;
  agent_role: string;
  caller_name: string;
  caller_phone: string;
  channel: 'browser' | 'telephony' | 'sip';
  status: 'ai_active' | 'whisper_listening' | 'supervisor_takeover' | 'transferred' | 'completed';
  started_at: number;
  duration_seconds: number;
  current_sentiment: 'Positive' | 'Neutral' | 'Frustrated';
  sentiment_score: number;
  is_escalated: boolean;
  escalation_reason?: string;
  escalated_at?: number;
  supervisor: {
    is_assigned: boolean;
    supervisor_id?: string;
    supervisor_name?: string;
    mode: 'idle' | 'whisper' | 'takeover';
    takeover_at?: number;
  };
  transcripts: HITLTranscriptItem[];
  copilot_suggestions: CopilotSuggestion[];
  transfer_details?: {
    target_phone: string;
    department: string;
    transferred_at: number;
  };
}

export interface EvalTestCase {
  id: string;
  name: string;
  category: 'policy' | 'tools' | 'guardrails' | 'escalation' | 'reasoning';
  user_turns: string[];
  expected_behavior: string;
  failure_criteria: string;
  expected_tool?: string;
  forbidden_words?: string[];
  required_words?: string[];
}

export interface EvalScenarioResult {
  test_case_id: string;
  test_name: string;
  category: string;
  passed: boolean;
  score: number;
  conversation: Array<{ role: 'user' | 'assistant'; text: string }>;
  tools_called: string[];
  latency_ms: number;
  judge_verdict: string;
  judge_feedback: string;
}

export interface EvalRunRecord {
  id: string;
  suite_id: string;
  suite_name: string;
  agent_id: string;
  agent_name: string;
  timestamp: number;
  duration_ms: number;
  status: 'running' | 'completed' | 'failed';
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  pass_rate: number;
  overall_score: number;
  metrics: {
    goal_completion_rate: number;
    hallucination_defense_score: number;
    tool_accuracy_score: number;
    guardrail_compliance_score: number;
    avg_turn_latency_ms: number;
  };
  results: EvalScenarioResult[];
}

export interface EvalTestSuite {
  id: string;
  name: string;
  description: string;
  test_cases: EvalTestCase[];
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  cartesiaVoiceId: string;
  elevenLabsVoiceId: string;
  sampleGreeting: string;
  systemPromptDirective: string;
  commonKeywords: string[];
}

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  script: string;
  matchedKeywords: string[];
  switched: boolean;
}

export interface LanguageSwitchEvent {
  id: string;
  sessionId: string;
  fromLanguage: string;
  toLanguage: string;
  confidence: number;
  triggerText: string;
  newVoiceId: string;
  timestamp: number;
}

export interface SessionLanguageState {
  sessionId: string;
  currentLanguage: string;
  autoDetectEnabled: boolean;
  supportedLanguages: string[];
  switchCount: number;
  history: LanguageSwitchEvent[];
  lockedLanguage?: string;
}

export type UserRole = 'admin' | 'agent_manager' | 'auditor_qa';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  permissions: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ipAddress: string;
  status: 'SUCCESS' | 'DENIED' | 'FAILED';
}

export interface VaultKeyRecord {
  id: string;
  provider: string;
  displayName: string;
  maskedKey: string;
  status: 'active' | 'rotated' | 'revoked';
  environment: 'production' | 'staging';
  lastRotated: number;
  version: number;
}

export type TabName = 'agents' | 'evals' | 'hitl' | 'knowledge' | 'playground' | 'telephony' | 'analytics' | 'monitor' | 'inspector';

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