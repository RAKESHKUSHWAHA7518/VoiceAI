import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { securityService, UserRole, AuditAction } from '../services/security';

const router = Router();

/**
 * GET /api/security/users
 * List all pre-configured enterprise user accounts with roles
 */
router.get(
  '/users',
  asyncHandler(async (req: Request, res: Response) => {
    const users = securityService.getAllUsers();
    res.json({
      success: true,
      users,
    });
  })
);

/**
 * GET /api/security/me
 * Get current authenticated user profile and permissions
 */
router.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = securityService.getCurrentUser();
    res.json({
      success: true,
      user: currentUser,
    });
  })
);

/**
 * POST /api/security/switch-user
 * Switch active role session (Admin, Agent Manager, Auditor QA)
 */
router.post(
  '/switch-user',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'userId string is required (user_admin, user_manager, user_auditor)' },
      });
    }

    try {
      const user = securityService.switchUser(userId);
      res.json({
        success: true,
        user,
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        error: { message: err.message },
      });
    }
  })
);

/**
 * GET /api/security/audit-logs
 * Retrieve immutable SOC2 / HIPAA audit log entries
 */
router.get(
  '/audit-logs',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = securityService.getCurrentUser();
    if (!securityService.hasPermission(currentUser.role, 'view_audit_logs')) {
      return res.status(403).json({
        success: false,
        error: { message: `Role '${currentUser.role}' is not authorized to view security audit logs` },
      });
    }

    const { role, action, limit } = req.query;
    const logs = securityService.getAuditLogs({
      role: role ? (role as UserRole) : undefined,
      action: action ? (action as AuditAction) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({
      success: true,
      logs,
      total: logs.length,
    });
  })
);

/**
 * POST /api/security/audit-logs
 * Append a verified event to the immutable audit log
 */
router.post(
  '/audit-logs',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = securityService.getCurrentUser();
    const { action, resource, details, status } = req.body;

    if (!action || !resource) {
      return res.status(400).json({
        success: false,
        error: { message: 'action and resource are required fields' },
      });
    }

    const entry = securityService.logAudit({
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      action: action as AuditAction,
      resource,
      details: details || {},
      ipAddress: req.ip || '127.0.0.1',
      status: status || 'SUCCESS',
    });

    res.status(201).json({
      success: true,
      entry,
    });
  })
);

/**
 * GET /api/security/vault
 * Get masked provider keys and rotation version tracking
 */
router.get(
  '/vault',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = securityService.getCurrentUser();
    const keys = securityService.getVaultKeys();

    res.json({
      success: true,
      keys,
      canManageKeys: securityService.hasPermission(currentUser.role, 'manage_keys'),
    });
  })
);

/**
 * POST /api/security/vault/rotate
 * Rotate an API key in the environment vault
 */
router.post(
  '/vault/rotate',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = securityService.getCurrentUser();
    const { keyId } = req.body;

    if (!keyId) {
      return res.status(400).json({
        success: false,
        error: { message: 'keyId is required' },
      });
    }

    try {
      const updatedKey = securityService.rotateVaultKey(keyId, currentUser);
      res.json({
        success: true,
        key: updatedKey,
      });
    } catch (err: any) {
      const statusCode = err.message.includes('Forbidden') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        error: { message: err.message },
      });
    }
  })
);

/**
 * POST /api/security/crypto/encrypt
 * AES-256-GCM encryption endpoint for recordings and sensitive call payloads
 */
router.post(
  '/crypto/encrypt',
  asyncHandler(async (req: Request, res: Response) => {
    const { data } = req.body;
    if (typeof data !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'data string is required' },
      });
    }

    const payload = securityService.encrypt(data);
    res.json({
      success: true,
      payload,
    });
  })
);

/**
 * POST /api/security/crypto/decrypt
 * AES-256-GCM decryption endpoint with authentication tag verification
 */
router.post(
  '/crypto/decrypt',
  asyncHandler(async (req: Request, res: Response) => {
    const { ciphertext, iv, authTag, algorithm } = req.body;
    if (!ciphertext || !iv || !authTag) {
      return res.status(400).json({
        success: false,
        error: { message: 'ciphertext, iv, and authTag are required' },
      });
    }

    try {
      const decrypted = securityService.decrypt({
        ciphertext,
        iv,
        authTag,
        algorithm: algorithm || 'aes-256-gcm',
        encryptedAt: Date.now(),
      });

      res.json({
        success: true,
        plaintext: decrypted.toString('utf8'),
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: `Decryption failed: ${err.message}` },
      });
    }
  })
);

export default router;
