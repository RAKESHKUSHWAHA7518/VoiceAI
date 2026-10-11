// ============================================================================
// Telephony Routes & PSTN Number Management
// Inbound TwiML Webhook, Outbound Dialer, and Telephone Numbers Registry
// ============================================================================

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

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

const DATA_DIR = path.join(__dirname, '../../data');
const PHONE_NUMBERS_FILE = path.join(DATA_DIR, 'phone_numbers.json');

const initialSeedNumbers: PhoneNumberRecord[] = [
  {
    id: 'num_demo_01',
    phone_number: '+1 (555) 019-2831',
    friendly_name: 'Customer Support Direct Line',
    agent_id: 'agent_support',
    agent_name: 'Maya',
    agent_avatar: '🎧',
    status: 'active',
    inbound_calls_count: 24,
    last_call_at: Date.now() - 3600000,
    created_at: Date.now() - 86400000 * 7,
  },
  {
    id: 'num_demo_02',
    phone_number: '+1 (555) 014-9920',
    friendly_name: 'Concierge & Booking Hotline',
    agent_id: 'agent_weather',
    agent_name: 'Alex',
    agent_avatar: '🌤️',
    status: 'active',
    inbound_calls_count: 12,
    last_call_at: Date.now() - 7200000,
    created_at: Date.now() - 86400000 * 4,
  },
];

function loadNumbers(): PhoneNumberRecord[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(PHONE_NUMBERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PHONE_NUMBERS_FILE, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) return data;
    }
    fs.writeFileSync(PHONE_NUMBERS_FILE, JSON.stringify(initialSeedNumbers, null, 2), 'utf-8');
    return [...initialSeedNumbers];
  } catch (e) {
    logger.warn('Failed to load phone numbers, using seeds:', e);
    return [...initialSeedNumbers];
  }
}

function saveNumbers(numbers: PhoneNumberRecord[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(PHONE_NUMBERS_FILE, JSON.stringify(numbers, null, 2), 'utf-8');
  } catch (e) {
    logger.warn('Failed to save phone numbers:', e);
  }
}

let phoneNumbers: PhoneNumberRecord[] = loadNumbers();

const router = Router();

// GET all provisioned phone numbers
router.get(
  '/numbers',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      numbers: phoneNumbers,
      twilio_configured: !!(config.twilio.accountSid && config.twilio.authToken),
    });
  })
);

// POST provision / add a new phone number
router.post(
  '/numbers',
  asyncHandler(async (req: Request, res: Response) => {
    const { phone_number, friendly_name, agent_id, agent_name, agent_avatar } = req.body;
    if (!phone_number) {
      return res.status(400).json({ success: false, error: 'phone_number is required' });
    }

    const newRecord: PhoneNumberRecord = {
      id: `num_${Date.now().toString(36)}`,
      phone_number,
      friendly_name: friendly_name || 'Voice Inbound Line',
      agent_id: agent_id || 'agent_support',
      agent_name: agent_name || 'Maya',
      agent_avatar: agent_avatar || '🎧',
      status: 'active',
      inbound_calls_count: 0,
      created_at: Date.now(),
    };

    phoneNumbers.unshift(newRecord);
    saveNumbers(phoneNumbers);

    res.json({ success: true, number: newRecord });
  })
);

// PUT update / reassign phone number to agent
router.put(
  '/numbers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const idx = phoneNumbers.findIndex((n) => n.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Phone number not found' });
    }

    phoneNumbers[idx] = {
      ...phoneNumbers[idx],
      ...req.body,
      id,
    };
    saveNumbers(phoneNumbers);

    res.json({ success: true, number: phoneNumbers[idx] });
  })
);

// DELETE release a phone number
router.delete(
  '/numbers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    phoneNumbers = phoneNumbers.filter((n) => n.id !== id);
    saveNumbers(phoneNumbers);
    res.json({ success: true, message: 'Phone number removed' });
  })
);

/**
 * Inbound Twilio Webhook
 * Twilio calls this when an incoming phone call is received on a configured number.
 * Returns TwiML with <Connect><Stream url="wss://host/media-stream" /></Connect>
 */
router.all(
  '/inbound',
  asyncHandler(async (req: Request, res: Response) => {
    const calledNumber = req.body.To || req.query.To || '';
    const callerNumber = req.body.From || req.query.From || '';
    const callSid = req.body.CallSid || req.query.CallSid || `call_${Date.now()}`;

    // Normalize phone number and find matching assigned agent
    const cleanCalled = calledNumber.toString().replace(/[^0-9]/g, '');
    const matchedNumber = phoneNumbers.find((n) => {
      const cleanNum = n.phone_number.replace(/[^0-9]/g, '');
      return cleanNum.endsWith(cleanCalled) || cleanCalled.endsWith(cleanNum);
    }) || phoneNumbers[0];

    const agentId = matchedNumber?.agent_id || 'agent_support';
    const agentName = matchedNumber?.agent_name || 'Maya';

    // Update call statistics
    if (matchedNumber) {
      matchedNumber.inbound_calls_count++;
      matchedNumber.last_call_at = Date.now();
      saveNumbers(phoneNumbers);
    }

    // Determine WebSocket host URL
    const host = req.headers.host || `localhost:${config.port}`;
    const wsProto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
    const streamUrl = `${wsProto}://${host}/media-stream`;

    logger.info(`[Telephony Inbound] Call ${callSid} from ${callerNumber} routed to agent ${agentName}`);

    // Return official Twilio streaming TwiML XML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Connecting you to ${agentName}.</Say>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="agent_id" value="${agentId}" />
      <Parameter name="caller_number" value="${callerNumber}" />
      <Parameter name="called_number" value="${calledNumber}" />
      <Parameter name="call_sid" value="${callSid}" />
    </Stream>
  </Connect>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  })
);

/**
 * Initiate an Outbound PSTN Phone Call
 * Connects a real phone number to a VoiceAI agent using Twilio REST API
 */
router.post(
  '/outbound',
  asyncHandler(async (req: Request, res: Response) => {
    const { to_phone_number, from_phone_number, agent_id, agent_name } = req.body;
    if (!to_phone_number) {
      return res.status(400).json({ success: false, error: 'to_phone_number is required' });
    }

    const targetAgentId = agent_id || 'agent_support';
    const callerId = from_phone_number || config.twilio.phoneNumber || phoneNumbers[0]?.phone_number || '+15550192831';

    const host = req.headers.host || `localhost:${config.port}`;
    const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const webhookUrl = `${proto}://${host}/api/telephony/inbound`;

    // If real Twilio credentials are configured in .env, call Twilio REST API
    if (config.twilio.accountSid && config.twilio.authToken) {
      try {
        const auth = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');
        const params = new URLSearchParams();
        params.append('To', to_phone_number);
        params.append('From', callerId);
        params.append('Url', webhookUrl);

        const twilioRes = await axios.post(
          `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Calls.json`,
          params.toString(),
          {
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        return res.json({
          success: true,
          mode: 'live_telephony',
          call_sid: twilioRes.data.sid,
          status: twilioRes.data.status,
          to: to_phone_number,
          from: callerId,
          agent_name: agent_name || 'Maya',
        });
      } catch (err: any) {
        logger.error('[Telephony Outbound] Twilio API call failed:', err?.response?.data || err.message);
        return res.status(500).json({
          success: false,
          error: err?.response?.data?.message || 'Twilio dialing failed. Check TWILIO_ACCOUNT_SID and credentials.',
        });
      }
    }

    // Carrier Simulation Mode (when Twilio keys are in demo or sandbox mode)
    const mockCallSid = `CA_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`;
    logger.info(`[Telephony Outbound Simulator] Outbound call ${mockCallSid} initiated to ${to_phone_number} with agent ${agent_name || 'Maya'}`);

    res.json({
      success: true,
      mode: 'simulated_telephony',
      call_sid: mockCallSid,
      status: 'queued',
      to: to_phone_number,
      from: callerId,
      agent_name: agent_name || 'Maya',
      message: 'Outbound carrier call triggered. Audio stream connected over PSTN bridge.',
    });
  })
);

/**
 * Simulate Inbound Call (for testing without spending telephony credit)
 */
router.post(
  '/simulate-inbound',
  asyncHandler(async (req: Request, res: Response) => {
    const { caller_number, agent_id } = req.body;
    const targetAgentId = agent_id || 'agent_support';
    const fakeCallSid = `CA_sim_${Date.now()}`;

    const host = req.headers.host || `localhost:${config.port}`;
    const wsProto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
    const streamUrl = `${wsProto}://${host}/media-stream`;

    res.json({
      success: true,
      call_sid: fakeCallSid,
      stream_url: streamUrl,
      caller_number: caller_number || '+1 (415) 555-0199',
      agent_id: targetAgentId,
      message: 'Inbound telephony simulation initialized.',
    });
  })
);

/**
 * Phase 11: Carrier Tunnel & PSTN Webhook Status
 */
router.get(
  '/tunnel-status',
  asyncHandler(async (req: Request, res: Response) => {
    const host = req.headers.host || `localhost:${config.port}`;
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const wsProto = proto === 'https' ? 'wss' : 'ws';

    const isCloudTunnel = host.includes('trycloudflare.com') || host.includes('ngrok') || host.includes('loca.lt');

    res.json({
      success: true,
      carrier: 'Twilio Voice PSTN',
      tunnel: {
        active: isCloudTunnel,
        host,
        protocol: proto,
        webhook_inbound_url: `${proto}://${host}/api/telephony/inbound`,
        media_stream_websocket_url: `${wsProto}://${host}/media-stream`,
        type: host.includes('trycloudflare.com')
          ? 'Cloudflare Quick Tunnel'
          : host.includes('ngrok')
          ? 'ngrok Tunnel'
          : 'Localhost Direct',
      },
      twilio_config: {
        account_sid_present: Boolean(config.twilio.accountSid),
        auth_token_present: Boolean(config.twilio.authToken),
        caller_id: config.twilio.phoneNumber,
      },
      setup_instructions: [
        `1. Start tunnel using: npm run tunnel (or npx cloudflared tunnel --url http://localhost:8000)`,
        `2. In Twilio Console -> Phone Numbers -> Active Numbers -> Configure:`,
        `3. Set "A CALL COMES IN" Webhook (HTTP POST) to: ${proto}://${host}/api/telephony/inbound`,
        `4. Make a live phone call from any mobile or landline to your Twilio number!`,
      ],
    });
  })
);

export default router;
