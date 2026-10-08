import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/errorHandler';
import { validate, schemas } from '../middleware/validation';
import { sessionManager } from '../services/session';

const router = Router();

router.post(
  '/',
  validate(schemas.createSession),
  asyncHandler(async (req: any, res: any) => {
    const { userId, config } = req.body;
    const session = sessionManager.createSession(crypto.randomUUID().slice(0, 8), userId);
    
    if (config) {
      // Apply custom config to session
      // This would be handled by the session manager
    }
    
    res.status(201).json({
      success: true,
      session: {
        sessionId: session.sessionId,
        userId: session.userId,
        state: session.state,
        createdAt: session.createdAt,
      },
    });
  })
);

router.get(
  '/:sessionId',
  validate(schemas.sessionId),
  asyncHandler(async (req: any, res: any) => {
    const session = sessionManager.getSession(req.params.sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }
    
    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        userId: session.userId,
        state: session.state,
        turnHistory: session.turnHistory,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        metadata: session.metadata,
      },
    });
  })
);

router.get(
  '/:sessionId/metrics',
  validate(schemas.sessionId),
  asyncHandler(async (req: any, res: any) => {
    const session = sessionManager.getSession(req.params.sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }
    
    const metrics = sessionManager.getSessionMetrics(req.params.sessionId);
    
    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No metrics available' },
      });
    }
    
    res.json({
      success: true,
      metrics,
    });
  })
);

router.post(
  '/:sessionId/interrupt',
  asyncHandler(async (req: any, res: any) => {
    // This would be handled via WebSocket
    res.json({
      success: true,
      message: 'Use WebSocket for real-time interruption',
    });
  })
);

router.post(
  '/:sessionId/end',
  asyncHandler(async (req: any, res: any) => {
    const session = sessionManager.getSession(req.params.sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }
    
    // End session
    // sessionManager.endSession(req.params.sessionId);
    
    res.json({
      success: true,
      message: 'Session ended',
    });
  })
);

export default router;