import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { requireWorkspace, sameOrigin, sessionToken } from '../middleware/workspace';
import { accountForToken, publicAccount, signIn, signOut, signUp } from '../services/accounts';

const router = Router();
router.use(sameOrigin);
router.post('/signup', asyncHandler(async (req: Request, res: Response) => {
  const user = await signUp(req.body);
  res.status(201).json({ success: true, user });
}));
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const result = await signIn(req.body);
  res.cookie('voiceai_session', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 86400000, path: '/' });
  res.json({ success: true, user: result.user });
}));
router.get('/me', requireWorkspace, (req, res) => {
  res.json({ success: true, user: publicAccount(accountForToken(sessionToken(req))!) });
});
router.post('/logout', requireWorkspace, asyncHandler(async (req: Request, res: Response) => {
  await signOut(sessionToken(req)!);
  res.clearCookie('voiceai_session', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ success: true });
}));
export default router;
