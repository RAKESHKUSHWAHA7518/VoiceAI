import { dataPath } from '../config/storage';
import { CallModel } from '../models/call.model';
import type { CallQAscore, CallAnalyticsRecord } from '../models/call.model';
export type { CallQAscore, CallAnalyticsRecord } from '../models/call.model';
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config';
import { OpenAILLM } from '../services/llm';



import fs from 'fs';
import path from 'path';
import { PersistentStore } from '../services/database';

const DATA_DIR = dataPath();
const CALLS_FILE = path.join(DATA_DIR, 'calls.json');
const RECORDINGS_DIR = path.join(DATA_DIR, 'recordings');

if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Realistic seed data
const initialSeedCalls: CallAnalyticsRecord[] = [
  {
    id: 'call_demo_101',
    session_id: 'sess_982a',
    agent_id: 'agent_support',
    agent_name: 'Maya',
    agent_avatar: '🎧',
    agent_role: 'Customer Support Lead',
    timestamp: Date.now() - 3600000 * 2,
    duration_seconds: 74,
    summary: 'Caller inquired about booking reference BK-9842. Maya confirmed the reservation for 4 guests on Dec 25 and answered questions promptly.',
    sentiment: 'Positive',
    sentiment_score: 92,
    resolution_status: 'Resolved',
    topics: ['Booking Status', 'Reservation Verification', 'Party Size'],
    action_items: ['Send booking confirmation SMS to caller', 'Ensure high chair is noted for party'],
    qa_scores: {
      overall_score: 95,
      empathy: 96,
      clarity: 98,
      tool_accuracy: 100,
      response_speed: 92,
    },
    transcripts: [
      { role: 'assistant', text: "Hello! I'm Maya, your customer support specialist. How can I help you today?" },
      { role: 'user', text: 'Hi Maya, can you check my booking reference BK-9842?' },
      { role: 'assistant', text: 'I found your booking BK-9842. The status is confirmed for a party of 4 on 2024-12-25 at 14:30.' },
      { role: 'user', text: 'That sounds perfect, thank you so much!' },
      { role: 'assistant', text: 'You are very welcome! Have a wonderful day.' },
    ],
    tool_calls_count: 1,
  },
  {
    id: 'call_demo_102',
    session_id: 'sess_441b',
    agent_id: 'agent_weather',
    agent_name: 'Alex',
    agent_avatar: '🌤️',
    agent_role: 'Concierge & Weather Specialist',
    timestamp: Date.now() - 3600000 * 5,
    duration_seconds: 48,
    summary: 'User requested live weather conditions for Tokyo. Alex retrieved real-time temperature (18°C) and clear sunny conditions.',
    sentiment: 'Positive',
    sentiment_score: 88,
    resolution_status: 'Resolved',
    topics: ['Weather Forecast', 'Tokyo Travel', 'Temperature'],
    action_items: ['User advised to carry light jacket for evening travel'],
    qa_scores: {
      overall_score: 92,
      empathy: 90,
      clarity: 95,
      tool_accuracy: 100,
      response_speed: 94,
    },
    transcripts: [
      { role: 'assistant', text: "Hi there! I'm Alex, your concierge and weather guide. What city or forecast can I look up for you?" },
      { role: 'user', text: "What's the weather in Tokyo right now?" },
      { role: 'assistant', text: 'The current weather in Tokyo is sunny and 18 degrees with 45 percent humidity.' },
      { role: 'user', text: 'Great, thanks Alex!' },
    ],
    tool_calls_count: 1,
  },
];

function loadCallsFromDisk(): CallAnalyticsRecord[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(CALLS_FILE)) {
      const content = fs.readFileSync(CALLS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    fs.writeFileSync(CALLS_FILE, JSON.stringify(initialSeedCalls, null, 2), 'utf-8');
    return [...initialSeedCalls];
  } catch (e) {
    console.warn('Failed to load calls from disk, using initial seed:', e);
    return [...initialSeedCalls];
  }
}

// Persistent call records store
const callHistory: CallAnalyticsRecord[] = loadCallsFromDisk();
const callsStore = new PersistentStore(CallModel, CALLS_FILE, () => callHistory, records => {
  callHistory.splice(0, callHistory.length, ...records);
});

export async function addCallRecord(record: CallAnalyticsRecord): Promise<void> {
  callHistory.unshift(record);
  if (callHistory.length > 100) callHistory.pop();
  await callsStore.save();
}

const router = Router();

// GET all calls
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      calls: callHistory,
    });
  })
);

// GET single call by ID
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const call = callHistory.find(c => c.id === req.params.id);
    if (!call) {
      return res.status(404).json({ success: false, error: { message: 'Call record not found' } });
    }
    res.json({ success: true, call });
  })
);

// POST analyze a completed call
router.post(
  '/analyze',
  asyncHandler(async (req: Request, res: Response) => {
    const session_id = req.body.session_id || req.body.sessionId || `sess_${Math.random().toString(36).slice(2, 8)}`;
    const agent_id = req.body.agent_id || req.body.agentId || 'agent_support';
    const agent_name = req.body.agent_name || req.body.agentName || 'Maya';
    const agent_avatar = req.body.agent_avatar || req.body.agentAvatar || '🤖';
    const agent_role = req.body.agent_role || req.body.agentRole || 'Customer Support Lead';
    const duration_seconds = Number(req.body.duration_seconds ?? req.body.durationSeconds ?? 20);
    const tool_calls_count = Number(req.body.tool_calls_count ?? req.body.toolCallsCount ?? 0);

    const rawList = Array.isArray(req.body.transcripts)
      ? req.body.transcripts
      : (Array.isArray(req.body.messages) ? req.body.messages : []);

    const transcriptList = rawList.map((t: any) => ({
      role: t.role || (t.sender === 'user' ? 'user' : 'assistant'),
      text: t.text || t.content || '',
      timestamp: t.timestamp || new Date().toISOString(),
    }));

    const conversationText = transcriptList
      .map((t: any) => `${t.role === 'user' ? 'User' : 'Agent'}: ${t.text}`)
      .join('\n');

    let summary = '';
    let sentiment: 'Positive' | 'Neutral' | 'Frustrated' | 'Curious' = 'Positive';
    let sentiment_score = 85;
    let resolution_status: 'Resolved' | 'Needs Follow-Up' | 'Escalated' | 'Unresolved' = 'Resolved';
    let topics: string[] = ['General Inquiry'];
    let action_items: string[] = [];
    let qa_scores: CallQAscore = {
      overall_score: 90,
      empathy: 90,
      clarity: 92,
      tool_accuracy: 95,
      response_speed: 90,
    };

    // Use OpenAI for deep intelligence if API key is present and not running in test mode
    if (config.apiKeys?.openai && process.env.NODE_ENV !== 'test' && conversationText.trim().length > 10) {
      try {
        const llm = new OpenAILLM(config.apiKeys.openai, 'gpt-4o-mini');
        const prompt = `You are a Voice AI Quality Assurance & Analytics auditor. Analyze the following conversation transcript between a User and a Voice Agent (${agent_name} - ${agent_role}):

TRANSCRIPT:
${conversationText}

Return a valid JSON object strictly matching this schema:
{
  "summary": "2-3 concise sentences summarizing the call interaction and result",
  "sentiment": "Positive" | "Neutral" | "Frustrated" | "Curious",
  "sentiment_score": number between 50 and 100,
  "resolution_status": "Resolved" | "Needs Follow-Up" | "Escalated" | "Unresolved",
  "topics": ["Array", "of", "2 to 4 key topics discussed"],
  "action_items": ["Array of extracted follow-up tasks if any, or empty"],
  "qa_scores": {
    "overall_score": number between 75 and 100,
    "empathy": number between 75 and 100,
    "clarity": number between 75 and 100,
    "tool_accuracy": number between 80 and 100,
    "response_speed": number between 80 and 100
  }
}`;

        let rawResponse = '';
        for await (const chunk of llm.streamChat([{ role: 'system', content: 'You are an analytics and QA evaluator. Output only valid JSON.' }], prompt)) {
          if (chunk.content) rawResponse += chunk.content;
        }

        const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.summary) summary = parsed.summary;
        if (parsed.sentiment) sentiment = parsed.sentiment;
        if (parsed.sentiment_score) sentiment_score = parsed.sentiment_score;
        if (parsed.resolution_status) resolution_status = parsed.resolution_status;
        if (Array.isArray(parsed.topics)) topics = parsed.topics;
        if (Array.isArray(parsed.action_items)) action_items = parsed.action_items;
        if (parsed.qa_scores) qa_scores = parsed.qa_scores;
      } catch (err) {
        console.warn('OpenAI QA scorecard fallback:', err);
      }
    }

    // Heuristic fallbacks if AI extraction not available
    if (!summary) {
      const userTurns = transcriptList.filter((t: any) => t.role === 'user');
      const lastUser = userTurns[userTurns.length - 1]?.text || 'information';
      summary = `Call with ${agent_name}. The caller discussed "${lastUser.slice(0, 50)}...". Conversation was completed successfully.`;
      
      const lower = conversationText.toLowerCase();
      if (lower.includes('weather')) {
        topics = ['Weather Information', 'Forecast Query'];
      } else if (lower.includes('booking')) {
        topics = ['Booking Reservation', 'Status Check'];
      } else if (lower.includes('transfer')) {
        topics = ['Department Routing', 'Call Transfer'];
        resolution_status = 'Escalated';
      } else if (lower.includes('order')) {
        topics = ['Order Tracking', 'Delivery Status'];
      }

      if (lower.includes('thank') || lower.includes('great') || lower.includes('perfect')) {
        sentiment = 'Positive';
        sentiment_score = 95;
      } else if (lower.includes('error') || lower.includes('wrong') || lower.includes('issue')) {
        sentiment = 'Frustrated';
        sentiment_score = 65;
        resolution_status = 'Needs Follow-Up';
      }

      if (resolution_status === 'Needs Follow-Up') {
        action_items = ['Follow up with customer to ensure complete resolution'];
      }
    }

    const id = `call_${Date.now().toString(36)}`;
    let audio_url = req.body.audio_url || req.body.audioUrl;
    const audio_base64 = req.body.audio_base64 || req.body.audioBase64;
    if (audio_base64 && typeof audio_base64 === 'string') {
      try {
        const cleanBase64 = audio_base64.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');
        const audioBuffer = Buffer.from(cleanBase64, 'base64');
        const filename = `${id}.webm`;
        const filePath = path.join(RECORDINGS_DIR, filename);
        fs.writeFileSync(filePath, audioBuffer);
        audio_url = `/recordings/${filename}`;
      } catch (err) {
        console.warn('Failed to save audio recording:', err);
      }
    }

    const newRecord: CallAnalyticsRecord = {
      id,
      session_id,
      agent_id,
      agent_name,
      agent_avatar,
      agent_role,
      timestamp: Date.now(),
      duration_seconds: Math.max(1, duration_seconds),
      summary,
      sentiment,
      sentiment_score,
      resolution_status,
      topics,
      action_items,
      qa_scores,
      transcripts: transcriptList,
      tool_calls_count,
      audio_url,
    };

    await addCallRecord(newRecord);

    res.json({
      success: true,
      call: newRecord,
      record: newRecord,
    });
  })
);

// POST upload standalone call recording
router.post(
  '/upload-recording',
  asyncHandler(async (req: Request, res: Response) => {
    const audio_base64 = req.body.audio_base64 || req.body.audioBase64;
    const filename = req.body.filename || `rec_${Date.now().toString(36)}.webm`;
    if (!audio_base64 || typeof audio_base64 !== 'string') {
      return res.status(400).json({ success: false, error: { message: 'Missing audio_base64 payload' } });
    }
    try {
      const cleanBase64 = audio_base64.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');
      const audioBuffer = Buffer.from(cleanBase64, 'base64');
      const filePath = path.join(RECORDINGS_DIR, filename);
      fs.writeFileSync(filePath, audioBuffer);
      res.json({
        success: true,
        audio_url: `/recordings/${filename}`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to write recording' } });
    }
  })
);

// DELETE call record
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idx = callHistory.findIndex(c => c.id === req.params.id);
    if (idx >= 0) {
      const call = callHistory[idx];
      if (call.audio_url && call.audio_url.startsWith('/recordings/')) {
        const localPath = path.join(RECORDINGS_DIR, path.basename(call.audio_url));
        if (fs.existsSync(localPath)) {
          try { fs.unlinkSync(localPath); } catch {}
        }
      }
      callHistory.splice(idx, 1);
      await callsStore.save();
    }
    res.json({
      success: true,
      message: 'Call record deleted',
    });
  })
);

export default router;
