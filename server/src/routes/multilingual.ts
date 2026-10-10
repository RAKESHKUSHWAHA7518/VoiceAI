import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { multilingualManager } from '../services/multilingual';

const router = Router();

/**
 * GET /api/multilingual/languages
 * List all supported languages, voice model presets, and greetings
 */
router.get(
  '/languages',
  asyncHandler(async (req: Request, res: Response) => {
    const languages = multilingualManager.getSupportedLanguages();
    res.json({
      success: true,
      languages,
      total: languages.length,
    });
  })
);

/**
 * POST /api/multilingual/detect
 * Fast language detection for an input phrase or transcript chunk
 */
router.post(
  '/detect',
  asyncHandler(async (req: Request, res: Response) => {
    const { text, allowed_languages } = req.body;
    if (typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Text string is required for language detection' },
      });
    }

    const detection = multilingualManager.detectLanguage(text, allowed_languages);
    res.json({
      success: true,
      ...detection,
    });
  })
);

/**
 * GET /api/multilingual/sessions/:sessionId
 * Get language state and switch audit trail for a call session
 */
router.get(
  '/sessions/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const sessionState = multilingualManager.getOrInitSession(sessionId);

    res.json({
      success: true,
      state: sessionState,
    });
  })
);

/**
 * POST /api/multilingual/sessions/:sessionId/switch
 * Manually switch language and TTS voice for a session
 */
router.post(
  '/sessions/:sessionId/switch',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { language, lock } = req.body;

    if (!language || typeof language !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Target language code is required (e.g., "es", "en", "fr")' },
      });
    }

    try {
      const result = multilingualManager.manualSwitch(sessionId, language, Boolean(lock));
      res.json({
        ...result,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message },
      });
    }
  })
);

/**
 * POST /api/multilingual/sessions/:sessionId/auto-detect
 * Toggle auto-detect mode on or off
 */
router.post(
  '/sessions/:sessionId/auto-detect',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { enabled } = req.body;

    const state = multilingualManager.setAutoDetect(sessionId, Boolean(enabled));
    res.json({
      success: true,
      state,
    });
  })
);

/**
 * POST /api/multilingual/sessions/:sessionId/process
 * Test process a turn transcript to check if it triggers a language switch
 */
router.post(
  '/sessions/:sessionId/process',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Text string is required' },
      });
    }

    const result = multilingualManager.processTurnTranscript(sessionId, text);
    res.json({
      success: true,
      ...result,
    });
  })
);

export default router;
