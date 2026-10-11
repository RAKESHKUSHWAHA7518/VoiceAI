// ============================================================================
// Phase 11: Twilio Webhook Signature Verification Middleware
// Enforces cryptographic HMAC-SHA1 validation of incoming carrier webhooks
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from '../config';
import logger from '../utils/logger';

export function validateTwilioSignature(
  authToken: string,
  twilioSignature: string,
  url: string,
  params: Record<string, any>
): boolean {
  if (!authToken || !twilioSignature) return false;

  // 1. Sort the request parameters alphabetically by key
  const sortedKeys = Object.keys(params).sort();
  let dataToSign = url;
  for (const key of sortedKeys) {
    dataToSign += key + params[key];
  }

  // 2. Compute HMAC-SHA1 digest using authToken as secret
  const hmac = crypto.createHmac('sha1', authToken);
  hmac.update(Buffer.from(dataToSign, 'utf-8'));
  const expectedSignature = hmac.digest('base64');

  // 3. Constant-time equality comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(twilioSignature, 'utf-8'),
      Buffer.from(expectedSignature, 'utf-8')
    );
  } catch {
    return false;
  }
}

export function twilioAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If in test or dev mode with no auth token, allow pass-through
  const authToken = config.twilio.authToken;
  if (!authToken || process.env.NODE_ENV === 'test' || process.env.BYPASS_TWILIO_SIGNATURE === 'true') {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string;
  if (!twilioSignature) {
    logger.warn('[Twilio Security] Missing x-twilio-signature header');
    res.status(403).send('Forbidden: Missing carrier signature');
    return;
  }

  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const fullUrl = `${proto}://${req.headers.host}${req.originalUrl}`;
  const params = req.method === 'POST' ? req.body : req.query;

  const isValid = validateTwilioSignature(authToken, twilioSignature, fullUrl, params);
  if (!isValid) {
    logger.warn(`[Twilio Security] Invalid signature for URL: ${fullUrl}`);
    res.status(403).send('Forbidden: Invalid Twilio signature');
    return;
  }

  next();
}
