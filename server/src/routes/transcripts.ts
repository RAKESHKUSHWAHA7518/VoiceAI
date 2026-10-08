import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validation';
import { schemas } from '../middleware/validation';
import { sessionManager } from '../services/session';

const router = Router();

router.get(
  '/:sessionId',
  async (req: any, res: any) => {
    const session = sessionManager.getSession(req.params.sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }
    
    res.json({
      success: true,
      transcripts: session.turnHistory.map((turn: any, index: number) => ({
        turnIndex: index,
        turnId: turn.turnId,
        userTranscript: turn.userTranscript,
        interimTranscript: turn.interimTranscript,
        timestamp: turn.startTime,
        isFinal: !!turn.endTime,
      })),
    });
  });

export default router;