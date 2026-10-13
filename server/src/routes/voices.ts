// ============================================================================
// Phase 13: Voice Library & Voice Cloning REST Routes
// ============================================================================

import { Router, Request, Response } from 'express';
import { voiceLibraryManager } from '../services/voice_library';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * List all voices (curated Cartesia, ElevenLabs, OpenAI, and custom clones)
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const voices = voiceLibraryManager.getAllVoices();
    const providers = {
      cartesia: voices.filter(v => v.provider === 'cartesia').length,
      elevenlabs: voices.filter(v => v.provider === 'elevenlabs').length,
      openai: voices.filter(v => v.provider === 'openai').length,
      custom_clone: voices.filter(v => v.provider === 'custom_clone').length,
    };

    res.json({
      success: true,
      voices,
      total_count: voices.length,
      providers,
    });
  })
);

/**
 * Stream playable preview audio (WAV) for any voice ID
 */
router.get(
  '/:id/preview',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const wavBuffer = voiceLibraryManager.generatePreviewWav(id);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', wavBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(wavBuffer);
  })
);

/**
 * Clone a new voice from audio sample
 */
router.post(
  '/clone',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, gender, accent, tone, description, sample_audio_base64 } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: 'Voice name is required',
      });
      return;
    }

    const clonedVoice = await voiceLibraryManager.cloneVoice({
      name,
      gender: gender || 'Female',
      accent,
      tone,
      description,
      sample_audio_base64,
    });

    res.status(201).json({
      success: true,
      voice: clonedVoice,
      message: `Voice "${clonedVoice.name}" successfully cloned and ready for use in agents.`,
    });
  })
);

/**
 * Delete a custom cloned voice
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const deleted = await voiceLibraryManager.deleteVoice(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: `Custom voice ${id} not found or cannot delete preset voices`,
      });
      return;
    }

    res.json({
      success: true,
      message: `Voice ${id} deleted successfully`,
    });
  })
);

export default router;
