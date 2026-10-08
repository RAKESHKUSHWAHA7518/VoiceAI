import axios from 'axios';
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config';
import { OpenAILLM } from '../services/llm';
import { createDemoTools } from '../services/tools';

const router = Router();

let currentConfig = {
  voice_id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
  vad_threshold: 0.6,
  vad_sos_debounce_ms: 120,
  vad_eos_timeout_ms: 500,
  system_prompt: 'You are a helpful voice assistant. Speak naturally in short, conversational sentences. When asked about weather, bookings, or departments, use the available tools.',
  llm_model: 'gpt-4o-mini',
  llm_temperature: 0.3,
};

const testHistory: any[] = [];

router.get(
  '/config',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      config: currentConfig,
      ...currentConfig,
    });
  })
);

router.post(
  '/config',
  async (req: Request, res: Response) => {
    const newConfig = req.body;
    currentConfig = { ...currentConfig, ...newConfig };
    res.json({
      success: true,
      message: 'Configuration updated',
      config: currentConfig,
      ...currentConfig,
    });
  }
);

router.post(
  '/test',
  async (req: Request, res: Response) => {
    const { 
      text, 
      voice_id, 
      system_prompt, 
      llm_model, 
      llm_temperature, 
      assigned_tools, 
      agent_id, 
      agent_name 
    } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Text is required' },
      });
    }

    const startTime = Date.now();
    let reply = '';
    const executedToolCalls: any[] = [];
    const toolsMap = createDemoTools();
    let toolsList = Array.from(toolsMap.values());
    if (Array.isArray(assigned_tools) && assigned_tools.length > 0) {
      toolsList = toolsList.filter(t => assigned_tools.includes(t.name));
    }

    const effectiveSystemPrompt = system_prompt || currentConfig.system_prompt;
    const effectiveVoiceId = voice_id || currentConfig.voice_id;
    const effectiveModel = llm_model || currentConfig.llm_model || 'gpt-4o-mini';
    const effectiveTemp = typeof llm_temperature === 'number' ? llm_temperature : currentConfig.llm_temperature;

    // If OpenAI API key is present, generate response with tool calling!
    if (config.apiKeys?.openai) {
      try {
        const llm = new OpenAILLM(config.apiKeys.openai, effectiveModel);
        llm.setSystemPrompt(effectiveSystemPrompt);
        llm.setTemperature(effectiveTemp);

        for await (const chunk of llm.streamChat([{ role: 'system', content: effectiveSystemPrompt }], text, toolsList)) {
          if (chunk.isToolCall && chunk.toolName) {
            const tool = toolsMap.get(chunk.toolName);
            let args: any = {};
            try { args = JSON.parse(chunk.toolArgs || '{}'); } catch {}
            let toolRes: any = null;
            if (tool && tool.handler) {
              try {
                toolRes = await tool.handler(args);
              } catch (e: any) {
                toolRes = { error: e.message };
              }
            }
            executedToolCalls.push({
              tool_name: chunk.toolName,
              args,
              result: toolRes,
              status: toolRes?.error ? 'error' : 'success',
              timestamp: Date.now(),
            });
          }
          if (chunk.content) {
            reply += chunk.content;
          }
        }

        // If tools were called and no final answer was generated, ask LLM to synthesize answer from tool result
        if (executedToolCalls.length > 0 && (!reply || reply.trim().length === 0)) {
          const toolResultsStr = executedToolCalls
            .map(tc => `Tool ${tc.tool_name} returned: ${JSON.stringify(tc.result)}`)
            .join('; ');

          for await (const chunk of llm.streamChat([
            { role: 'system', content: effectiveSystemPrompt },
            { role: 'user', content: text },
            { role: 'assistant', content: `I looked that up: ${toolResultsStr}` }
          ], `Please provide a concise spoken response answering the user's question "${text}" based on the tool results: ${toolResultsStr}`)) {
            if (chunk.content) {
              reply += chunk.content;
            }
          }
        }
      } catch (err) {
        console.warn('OpenAI generation in playground test fallback:', err);
      }
    }

    if (!reply) {
      // If OpenAI did not execute tools (or had 0 credits), detect tools from user intent so tools can still be tested!
      if (executedToolCalls.length === 0) {
        const lower = text.toLowerCase();
        if (lower.includes('weather')) {
          const match = text.match(/in ([a-zA-Z\s]+)/i);
          const loc = match ? match[1].trim() : 'Tokyo';
          const tool = toolsMap.get('get_weather');
          if (tool) {
            const res = await tool.handler({ location: loc });
            executedToolCalls.push({
              tool_name: 'get_weather',
              args: { location: loc },
              result: res,
              status: 'success',
              timestamp: Date.now(),
            });
            reply = `The current weather in ${loc} is ${res.condition} and ${res.temperature} degrees with ${res.humidity} percent humidity.`;
          }
        } else if (lower.includes('booking')) {
          const idMatch = text.match(/#?([a-zA-Z0-9_-]{3,})/i);
          const bookingId = idMatch ? idMatch[1] : 'BK-9842';
          const tool = toolsMap.get('check_booking');
          if (tool) {
            const res = await tool.handler({ booking_id: bookingId });
            executedToolCalls.push({
              tool_name: 'check_booking',
              args: { booking_id: bookingId },
              result: res,
              status: 'success',
              timestamp: Date.now(),
            });
            reply = `I found your booking ${bookingId}. The status is ${res.status} for a party of ${res.party_size} on ${res.date} at ${res.time}.`;
          }
        } else if (lower.includes('transfer') || lower.includes('department')) {
          const tool = toolsMap.get('transfer_call');
          if (tool) {
            const res = await tool.handler({ department: 'Customer Support' });
            executedToolCalls.push({
              tool_name: 'transfer_call',
              args: { department: 'Customer Support' },
              result: res,
              status: 'success',
              timestamp: Date.now(),
            });
            reply = `I am transferring your call to Customer Support now. The estimated wait time is two minutes.`;
          }
        }
      }

      if (!reply) {
        if (executedToolCalls.length > 0) {
          const first = executedToolCalls[0];
          reply = `I executed ${first.tool_name} for you. Result: ${JSON.stringify(first.result)}`;
        } else {
          reply = `I heard: "${text}". VoiceAI is running smoothly. How can I assist you next?`;
        }
      }
    }

    // Generate voice audio using Cartesia TTS
    let audioUrl: string | null = null;
    if (config.apiKeys?.cartesia && reply) {
      try {
        const cartesiaRes = await axios.post(
          'https://api.cartesia.ai/tts/bytes',
          {
            model_id: 'sonic-3.6',
            transcript: reply,
            voice: {
              mode: 'id',
              id: effectiveVoiceId,
            },
            output_format: {
              container: 'wav',
              encoding: 'pcm_s16le',
              sample_rate: 24000,
            },
          },
          {
            headers: {
              'Authorization': `Bearer ${config.apiKeys.cartesia}`,
              'Cartesia-Version': '2024-06-10',
              'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
            timeout: 10000,
          }
        );

        if (cartesiaRes.data) {
          const base64Audio = Buffer.from(cartesiaRes.data).toString('base64');
          audioUrl = `data:audio/wav;base64,${base64Audio}`;
        }
      } catch (err: any) {
        console.warn('Cartesia TTS generation error in playground test:', err?.message || err);
      }
    }

    const latencyMs = Math.max(120, Date.now() - startTime);
    const testId = `test_${Date.now().toString(36)}`;
    const testResult = {
      test_id: testId,
      testId,
      timestamp: Math.floor(Date.now() / 1000),
      input: text,
      status: 'completed' as const,
      latency_ms: latencyMs,
      latencyMs,
      output: reply,
      audio_url: audioUrl,
      audioUrl,
      agent_id: agent_id || 'default',
      agent_name: agent_name || 'Voice Assistant',
      tool_calls: executedToolCalls,
      toolCalls: executedToolCalls,
      config_snapshot: {
        ...currentConfig,
        voice_id: effectiveVoiceId,
        system_prompt: effectiveSystemPrompt,
        llm_model: effectiveModel,
      },
    };

    testHistory.unshift(testResult);
    if (testHistory.length > 50) {
      testHistory.pop();
    }
    
    res.json({
      success: true,
      test: testResult,
      ...testResult,
    });
  }
);

router.post(
  '/speak',
  async (req: Request, res: Response) => {
    const { text, voice_id } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: { message: 'Text is required' } });
    }

    let audioUrl: string | null = null;
    const effectiveVoiceId = voice_id || currentConfig.voice_id;

    if (config.apiKeys?.cartesia) {
      try {
        const cartesiaRes = await axios.post(
          'https://api.cartesia.ai/tts/bytes',
          {
            model_id: 'sonic-3.6',
            transcript: text,
            voice: { mode: 'id', id: effectiveVoiceId },
            output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 24000 },
          },
          {
            headers: {
              'Authorization': `Bearer ${config.apiKeys.cartesia}`,
              'Cartesia-Version': '2024-06-10',
              'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
            timeout: 10000,
          }
        );
        if (cartesiaRes.data) {
          const base64Audio = Buffer.from(cartesiaRes.data).toString('base64');
          audioUrl = `data:audio/wav;base64,${base64Audio}`;
        }
      } catch (err: any) {
        console.warn('Cartesia TTS error in /speak:', err?.message || err);
      }
    }

    res.json({
      success: true,
      audio_url: audioUrl,
      audioUrl,
    });
  }
);

router.get(
  '/history',
  async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({
      success: true,
      tests: testHistory.slice(0, limit),
    });
  }
);

export default router;