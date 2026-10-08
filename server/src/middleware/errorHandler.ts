import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { VoiceAIError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, RateLimitError, ProviderError } from '../types';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const timestamp = new Date().toISOString();
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  
  // Log error with context
  const logMeta = {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp,
    stack: err.stack,
  };

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: Record<string, unknown> | undefined;

  if (err instanceof VoiceAIError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
    
    // Log at appropriate level based on status code
    if (statusCode >= 500) {
      logger.error('Application error', { ...logMeta, err: err.message, code });
    } else if (statusCode >= 400) {
      logger.warn('Client error', { ...logMeta, err: err.message, code });
    }
  } else if (err.name === 'ZodError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    const validationErrors = (err as any).errors;
    details = { errors: validationErrors };
    logger.warn('Validation error', { ...logMeta, errors: validationErrors });
  } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'AUTHENTICATION_ERROR';
    message = 'Invalid or expired token';
    logger.warn('Authentication error', { ...logMeta, err: err.message });
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token has expired';
    logger.warn('Token expired', { ...logMeta, err: err.message });
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    code = 'UPLOAD_ERROR';
    message = err.message;
    logger.warn('Upload error', { ...logMeta, err: err.message });
  } else {
    // Unknown error
    logger.error('Unhandled error', { ...logMeta, stack: err.stack });
  }

  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: isProduction && statusCode >= 500 ? 'Internal server error' : message,
      requestId,
      timestamp,
      ...(details && !isProduction && { details }),
    },
  });
};

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const err = new Error(`Route ${req.method} ${req.url} not found`) as any;
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  next(err);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}