import { Request, Response, NextFunction } from 'express';
import { accountForToken } from '../services/accounts';
import { AuthenticationError } from '../types';

export const legacyDemo = () => process.env.VOICEAI_LEGACY_DEMO === 'true' && process.env.NODE_ENV !== 'production';
export function sessionToken(req: Request): string | undefined {
  return req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('voiceai_session='))?.slice('voiceai_session='.length);
}
export function workspaceId(req: Request): string | undefined { return (req as any).user?.workspaceId; }
export function requireWorkspace(req: Request, _res: Response, next: NextFunction) {
  const account = accountForToken(sessionToken(req));
  if (!account) return next(new AuthenticationError());
  (req as any).user = { id: account.id, email: account.email, workspaceId: account.workspace_id, roles: ['owner'] };
  next();
}
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ success: false, error: { message: 'Cross-site requests are not allowed' } });
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) return res.status(403).json({ success: false, error: { message: 'Request origin is not allowed' } });
    } catch { return res.status(403).json({ success: false, error: { message: 'Invalid request origin' } }); }
  }
  next();
}
