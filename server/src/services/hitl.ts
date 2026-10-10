// ============================================================================
// VoiceAI - Human-in-the-Loop (HITL) Service
// Real-time Supervisor Monitoring, AI Mute & Mic Takeover, Warm Transfer & Whisper Copilot
// ============================================================================

import { EventEmitter } from 'events';
import crypto from 'crypto';
import logger from '../utils/logger';

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
  sentiment_score: number; // 0 - 100
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

export class HITLEngine extends EventEmitter {
  private activeCalls: Map<string, HITLActiveCall> = new Map();

  // Escalation detection keywords
  private escalationKeywords: string[] = [
    'human',
    'representative',
    'manager',
    'supervisor',
    'operator',
    'real person',
    'speak to someone',
    'lawyer',
    'sue',
    'scam',
    'furious',
    'unacceptable',
    'cancel my subscription',
    'chargeback',
    'complaint',
    'ridiculous',
  ];

  constructor() {
    super();
    this.seedInitialCalls();
  }

  /**
   * Seed realistic active live calls for supervision showcase
   */
  private seedInitialCalls(): void {
    const now = Date.now();

    // Call 1: High-urgency frustrated caller escalated
    const call1: HITLActiveCall = {
      id: 'call_live_901',
      session_id: 'sess_live_901',
      agent_id: 'agent_support',
      agent_name: 'Maya',
      agent_role: 'Customer Support Lead',
      caller_name: 'David Miller',
      caller_phone: '+1 (415) 890-2134',
      channel: 'telephony',
      status: 'ai_active',
      started_at: now - 145000, // 2m 25s ago
      duration_seconds: 145,
      current_sentiment: 'Frustrated',
      sentiment_score: 32,
      is_escalated: true,
      escalation_reason: 'Caller expressed frustration regarding delayed priority delivery (#DLV-981) and demanded human supervisor',
      escalated_at: now - 45000,
      supervisor: {
        is_assigned: false,
        mode: 'idle',
      },
      transcripts: [
        {
          id: 'tr_1',
          role: 'assistant',
          text: 'Hello, thank you for calling VoiceAI customer care. How can I assist you with your delivery today?',
          timestamp: now - 140000,
          sentiment: 'Positive',
        },
        {
          id: 'tr_2',
          role: 'user',
          text: 'My package DLV-981 was supposed to be here 3 days ago for my daughter\'s birthday! This is completely unacceptable.',
          timestamp: now - 110000,
          sentiment: 'Frustrated',
        },
        {
          id: 'tr_3',
          role: 'assistant',
          text: 'I am so sorry to hear about this delay. Let me look up shipment DLV-981 right now to see the current logistics transit status.',
          timestamp: now - 85000,
          sentiment: 'Neutral',
        },
        {
          id: 'tr_4',
          role: 'user',
          text: 'No more automated robot excuses! I need to speak to a human manager or supervisor right now to get this resolved today.',
          timestamp: now - 50000,
          sentiment: 'Frustrated',
        },
      ],
      copilot_suggestions: [
        {
          id: 'copilot_1',
          text: 'I understand this is your daughter\'s birthday gift. As the supervisor, I am upgrading your delivery to same-day courier and issuing an immediate $50 credit.',
          category: 'deescalation',
          confidence: 0.96,
        },
        {
          id: 'copilot_2',
          text: 'I apologize for the logistical delay on package DLV-981. Let me personally contact the local dispatch depot while keeping you on the line.',
          category: 'action',
          confidence: 0.92,
        },
        {
          id: 'copilot_3',
          text: 'Would you prefer a direct courier drop-off this afternoon or a full product replacement rushed right now?',
          category: 'policy',
          confidence: 0.88,
        },
      ],
    };

    // Call 2: Normal VIP reservation call in progress
    const call2: HITLActiveCall = {
      id: 'call_live_902',
      session_id: 'sess_live_902',
      agent_id: 'agent_hotel',
      agent_name: 'Julian',
      agent_role: 'Luxury Hotel Concierge',
      caller_name: 'Elena Rostova',
      caller_phone: '+1 (212) 555-8931',
      channel: 'browser',
      status: 'ai_active',
      started_at: now - 62000, // ~1 minute ago
      duration_seconds: 62,
      current_sentiment: 'Positive',
      sentiment_score: 88,
      is_escalated: false,
      supervisor: {
        is_assigned: false,
        mode: 'idle',
      },
      transcripts: [
        {
          id: 'tr_21',
          role: 'assistant',
          text: 'Good afternoon. Welcome to The Grand Luxe Concierge. How may I orchestrate your stay today?',
          timestamp: now - 58000,
          sentiment: 'Positive',
        },
        {
          id: 'tr_22',
          role: 'user',
          text: 'Hello Julian! We would like to reserve the Penthouse Suite for this Friday evening with early check-in.',
          timestamp: now - 35000,
          sentiment: 'Positive',
        },
        {
          id: 'tr_23',
          role: 'assistant',
          text: 'Delighted to assist, Ms. Rostova. The Penthouse Suite is available with complimentary champagne on arrival. Shall I secure this for 2 guests?',
          timestamp: now - 15000,
          sentiment: 'Positive',
        },
      ],
      copilot_suggestions: [
        {
          id: 'copilot_21',
          text: 'Remind guest about Michelin-starred rooftop dinner reservation availability for Friday.',
          category: 'action',
          confidence: 0.94,
        },
      ],
    };

    this.activeCalls.set(call1.id, call1);
    this.activeCalls.set(call2.id, call2);
  }

  /**
   * List all current live active calls
   */
  public listActiveCalls(): HITLActiveCall[] {
    const now = Date.now();
    // Update live duration
    return Array.from(this.activeCalls.values()).map(call => {
      if (call.status !== 'completed' && call.status !== 'transferred') {
        call.duration_seconds = Math.max(1, Math.floor((now - call.started_at) / 1000));
      }
      return call;
    });
  }

  /**
   * Get single active call by ID
   */
  public getCall(callId: string): HITLActiveCall | undefined {
    const call = this.activeCalls.get(callId);
    if (call && call.status !== 'completed' && call.status !== 'transferred') {
      call.duration_seconds = Math.max(1, Math.floor((Date.now() - call.started_at) / 1000));
    }
    return call;
  }

  /**
   * Register a new live call from Web or Twilio Telephony
   */
  public registerCall(params: {
    id?: string;
    session_id?: string;
    agent_id: string;
    agent_name: string;
    agent_role?: string;
    caller_name?: string;
    caller_phone?: string;
    channel?: 'browser' | 'telephony' | 'sip';
  }): HITLActiveCall {
    const callId = params.id || `call_${crypto.randomUUID().slice(0, 8)}`;
    const newCall: HITLActiveCall = {
      id: callId,
      session_id: params.session_id || `sess_${callId}`,
      agent_id: params.agent_id,
      agent_name: params.agent_name,
      agent_role: params.agent_role || 'Voice Agent Specialist',
      caller_name: params.caller_name || 'Customer Caller',
      caller_phone: params.caller_phone || '+1 (555) 019-2831',
      channel: params.channel || 'browser',
      status: 'ai_active',
      started_at: Date.now(),
      duration_seconds: 0,
      current_sentiment: 'Positive',
      sentiment_score: 85,
      is_escalated: false,
      supervisor: {
        is_assigned: false,
        mode: 'idle',
      },
      transcripts: [],
      copilot_suggestions: this.generateDefaultSuggestions(),
    };

    this.activeCalls.set(callId, newCall);
    this.emit('callRegistered', newCall);
    logger.info(`[HITL] Registered call ${callId} for agent ${params.agent_name}`);
    return newCall;
  }

  /**
   * Record a dialogue message and evaluate automated escalation triggers
   */
  public recordMessage(
    callId: string,
    role: 'user' | 'assistant' | 'supervisor',
    text: string
  ): HITLActiveCall | undefined {
    const call = this.activeCalls.get(callId);
    if (!call) return undefined;

    // Detect sentiment heuristics
    let sentiment: 'Positive' | 'Neutral' | 'Frustrated' = 'Neutral';
    const lower = text.toLowerCase();

    if (lower.includes('thank') || lower.includes('great') || lower.includes('perfect') || lower.includes('awesome') || lower.includes('pleasure')) {
      sentiment = 'Positive';
      call.sentiment_score = Math.min(100, call.sentiment_score + 10);
    } else if (
      lower.includes('angry') ||
      lower.includes('upset') ||
      lower.includes('terrible') ||
      lower.includes('horrible') ||
      lower.includes('ridiculous') ||
      lower.includes('unacceptable') ||
      lower.includes('cancel') ||
      lower.includes('complaint')
    ) {
      sentiment = 'Frustrated';
      call.sentiment_score = Math.max(10, call.sentiment_score - 25);
    }

    call.current_sentiment = call.sentiment_score > 65 ? 'Positive' : call.sentiment_score < 45 ? 'Frustrated' : 'Neutral';

    // Add transcript
    const item: HITLTranscriptItem = {
      id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role,
      text,
      timestamp: Date.now(),
      sentiment,
    };
    call.transcripts.push(item);

    // Automated Escalation Trigger Check
    if (role === 'user' && !call.is_escalated) {
      const hasEscalationKeyword = this.escalationKeywords.some(keyword => lower.includes(keyword));
      const hasLowSentiment = call.sentiment_score < 40;

      if (hasEscalationKeyword || hasLowSentiment) {
        const reason = hasEscalationKeyword
          ? `Caller keyword trigger detected: "${this.escalationKeywords.find(k => lower.includes(k))}"`
          : 'Low caller sentiment score (<40%) sustained';
        this.escalateCall(callId, reason);
      }
    }

    // Refresh Copilot suggestions on user turn
    if (role === 'user') {
      call.copilot_suggestions = this.generateCopilotSuggestions(callId, text);
    }

    this.emit('messageRecorded', { callId, item, call });
    return call;
  }

  /**
   * Escalate a call for human supervisor intervention
   */
  public escalateCall(callId: string, reason: string): HITLActiveCall | undefined {
    const call = this.activeCalls.get(callId);
    if (!call) return undefined;

    call.is_escalated = true;
    call.escalation_reason = reason;
    call.escalated_at = Date.now();
    call.current_sentiment = 'Frustrated';
    call.sentiment_score = Math.min(call.sentiment_score, 35);
    call.copilot_suggestions = this.generateCopilotSuggestions(callId);

    this.emit('callEscalated', { callId, reason, call });
    logger.warn(`[HITL] Escalated call ${callId}: ${reason}`);
    return call;
  }

  /**
   * Human Supervisor enters silent Whisper Listen mode
   */
  public setWhisperMode(callId: string, supervisorName = 'Supervisor Sarah'): HITLActiveCall | undefined {
    const call = this.activeCalls.get(callId);
    if (!call) return undefined;

    call.status = 'whisper_listening';
    call.supervisor = {
      is_assigned: true,
      supervisor_name: supervisorName,
      supervisor_id: 'sup_01',
      mode: 'whisper',
    };

    this.emit('supervisorJoined', { callId, mode: 'whisper', supervisorName });
    logger.info(`[HITL] Supervisor ${supervisorName} entered Whisper Mode on call ${callId}`);
    return call;
  }

  /**
   * Human Supervisor Takes Over Call (Mutes AI, Bridges Microphone)
   */
  public takeoverCall(callId: string, supervisorName = 'Supervisor Sarah'): HITLActiveCall | undefined {
    const call = this.activeCalls.get(callId);
    if (!call) return undefined;

    call.status = 'supervisor_takeover';
    call.supervisor = {
      is_assigned: true,
      supervisor_name: supervisorName,
      supervisor_id: 'sup_01',
      mode: 'takeover',
      takeover_at: Date.now(),
    };

    // Add system notification to transcripts
    call.transcripts.push({
      id: `tr_takeover_${Date.now()}`,
      role: 'supervisor',
      text: `[SYSTEM] ${supervisorName} took over the call. Autonomous AI agent muted. Human microphone bridged to caller.`,
      timestamp: Date.now(),
      sentiment: 'Neutral',
    });

    this.emit('callTakenOver', { callId, supervisorName, call });
    logger.info(`[HITL] Human Supervisor ${supervisorName} took over call ${callId}. AI muted.`);
    return call;
  }

  /**
   * Hand back control to AI agent
   */
  public handbackToAI(callId: string): HITLActiveCall | undefined {
    const call = this.activeCalls.get(callId);
    if (!call) return undefined;

    call.status = 'ai_active';
    call.supervisor.mode = 'idle';

    call.transcripts.push({
      id: `tr_handback_${Date.now()}`,
      role: 'assistant',
      text: `[SYSTEM] Control returned to AI Agent ${call.agent_name}. Autonomous voice generation resumed.`,
      timestamp: Date.now(),
      sentiment: 'Positive',
    });

    this.emit('callHandedBack', { callId, call });
    logger.info(`[HITL] Call ${callId} handed back to AI Agent ${call.agent_name}`);
    return call;
  }

  /**
   * Warm Transfer to PSTN phone number or external department queue
   */
  public transferCall(
    callId: string,
    targetPhone: string,
    department = 'Tier 2 Escalations Team'
  ): HITLActiveCall | undefined {
    const call = this.activeCalls.get(callId);
    if (!call) return undefined;

    call.status = 'transferred';
    call.transfer_details = {
      target_phone: targetPhone,
      department,
      transferred_at: Date.now(),
    };

    call.transcripts.push({
      id: `tr_xfer_${Date.now()}`,
      role: 'supervisor',
      text: `[TRANSFER] Call warm-transferred to ${department} (${targetPhone}). Audio bridge disconnected.`,
      timestamp: Date.now(),
      sentiment: 'Positive',
    });

    this.emit('callTransferred', { callId, targetPhone, department, call });
    logger.info(`[HITL] Call ${callId} transferred to ${targetPhone} (${department})`);
    return call;
  }

  /**
   * End / Hang up an active call
   */
  public endCall(callId: string): HITLActiveCall | undefined {
    const call = this.activeCalls.get(callId);
    if (!call) return undefined;

    call.status = 'completed';
    this.emit('callEnded', { callId, call });
    logger.info(`[HITL] Call ${callId} concluded.`);
    return call;
  }

  /**
   * Generate context-aware Copilot suggestions for human supervisor
   */
  public generateCopilotSuggestions(callId: string, latestUserQuery?: string): CopilotSuggestion[] {
    const call = this.activeCalls.get(callId);
    const lastUserText = latestUserQuery || (call?.transcripts.filter(t => t.role === 'user').slice(-1)[0]?.text || '');
    const lower = lastUserText.toLowerCase();

    if (lower.includes('refund') || lower.includes('money back') || lower.includes('credit')) {
      return [
        {
          id: `sug_${Date.now()}_1`,
          text: 'I understand and apologize for this frustration. As the supervisor, I am initiating a 100% full refund to your original payment method immediately.',
          category: 'deescalation',
          confidence: 0.98,
        },
        {
          id: `sug_${Date.now()}_2`,
          text: 'Along with the refund, I would like to credit $25 to your account for the inconvenience.',
          category: 'policy',
          confidence: 0.91,
        },
      ];
    }

    if (lower.includes('delay') || lower.includes('late') || lower.includes('where is') || lower.includes('package')) {
      return [
        {
          id: `sug_${Date.now()}_1`,
          text: 'I see your tracking status here. Let me contact our priority courier dispatcher directly and provide you an exact delivery window.',
          category: 'action',
          confidence: 0.95,
        },
        {
          id: `sug_${Date.now()}_2`,
          text: 'I am waiving all shipping and handling charges from your original bill right now.',
          category: 'deescalation',
          confidence: 0.89,
        },
      ];
    }

    if (lower.includes('cancel') || lower.includes('stop')) {
      return [
        {
          id: `sug_${Date.now()}_1`,
          text: 'I can certainly process that cancellation for you without any penalties or hassle today.',
          category: 'policy',
          confidence: 0.94,
        },
        {
          id: `sug_${Date.now()}_2`,
          text: 'Before I confirm the cancellation, may I offer you 2 months free to see if we can resolve the issue?',
          category: 'deescalation',
          confidence: 0.86,
        },
      ];
    }

    return this.generateDefaultSuggestions();
  }

  private generateDefaultSuggestions(): CopilotSuggestion[] {
    return [
      {
        id: `sug_def_1`,
        text: 'Hello, my name is Sarah, the team supervisor. I am stepping in to take personal ownership of resolving this for you.',
        category: 'greeting',
        confidence: 0.97,
      },
      {
        id: `sug_def_2`,
        text: 'I have your complete history on my screen right now. Let me fix this directly for you without repeating any questions.',
        category: 'deescalation',
        confidence: 0.93,
      },
      {
        id: `sug_def_3`,
        text: 'Let me consult with our senior technical engineering desk while we remain connected.',
        category: 'action',
        confidence: 0.88,
      },
    ];
  }
}

export const hitlEngine = new HITLEngine();
