import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validation';
import { schemas } from '../middleware/validation';

const playgroundController = {
  getConfig: async (req: Request, res: Response) => {
    // In a real implementation, this would come from a config store
    res.json({
      success: true,
      config: {
        voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
        vadThreshold: 0.6,
        vadSosDebounceMs: 120,
        vadEosTimeoutMs: 500,
        systemPrompt: 'You are a helpful voice assistant. Speak naturally in short, conversational sentences. Avoid markdown, emojis, or special formatting. Spell out numbers (e.g., "twenty-five" not "25"). Keep responses concise and spoken-language appropriate. Use contractions and natural fillers.',
        llmModel: 'gpt-4o-mini',
        llmTemperature: 0.3,
      },
    });
  },

  updateConfig: async (req: Request, res: Response) => {
    const config = req.body;
    // In a real implementation, this would save to config store
    // and broadcast to connected clients
    return {
      success: true,
      message: 'Configuration updated',
      config,
    };
  },

  runTest: async (req: Request, res: Response) => {
    const { text } = req.body;
    
    if (!text || !text.trim()) {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Text is required' },
      };
    }

    // Simulate test execution
    const testId = `test_${Date.now()}`;
    const testResult = {
      testId,
      timestamp: Date.now(),
      input: text,
      status: 'completed',
      latencyMs: 450,
      output: `I received: "${text}". How can I help you further?`,
    };

    return {
      success: true,
      test: testResult,
    };
  },

  getHistory: async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    // In a real implementation, this would fetch from database
    res.json({
      success: true,
      tests: [],
    });
  },
};

export const getPlaygroundConfig = async (req: Request, res: Response) => {
  return playgroundController.getConfig(req, res);
};

export const updatePlaygroundConfig = asyncHandler(playgroundController.updateConfig);
export const runPlaygroundTest = asyncHandler(playgroundController.runTest);
export const getPlaygroundHistory = asyncHandler(playgroundController.getHistory);