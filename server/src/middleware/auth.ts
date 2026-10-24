import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { AuthenticationError, AuthorizationError } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    sessionId?: string;
  };
}

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError();
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as {
      id: string;
      email: string;
      roles: string[];
      sessionId?: string;
    };
    
    (req as any).user = {
      id: decoded.id,
      email: decoded.email,
      roles: decoded.roles,
      sessionId: decoded.sessionId,
    };
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    throw new AuthenticationError('Invalid token');
  }
};

export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    
    if (!user) {
      throw new AuthenticationError();
    }
    
    if (allowedRoles.length > 0 && !user.roles.some((role: string) => allowedRoles.includes(role))) {
      throw new AuthorizationError('Insufficient permissions');
    }
    
    next();
  };
};

export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as {
      id: string;
      email: string;
      roles: string[];
      sessionId?: string;
    };
    
    (req as any).user = {
      id: decoded.id,
      email: decoded.email,
      roles: decoded.roles,
      sessionId: decoded.sessionId,
    };
  } catch {
    // Ignore invalid token for optional auth
  }
  
  next();
};

export const requireSession = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;
  
  if (!user?.sessionId) {
    throw new AuthenticationError('Session required');
  }
  
  next();
};
