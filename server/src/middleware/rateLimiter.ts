import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import config from '../config';

// In-Memory sliding window rate limiter fallback
class InMemoryRateLimiter {
  private hits = new Map<string, number[]>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of this.hits.entries()) {
        const valid = timestamps.filter(t => now - t < 3600000);
        if (valid.length === 0) {
          this.hits.delete(key);
        } else {
          this.hits.set(key, valid);
        }
      }
    }, 60000);
    this.cleanupInterval.unref();
  }

  check(key: string, windowMs: number, maxRequests: number): { allowed: boolean; count: number } {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (this.hits.get(key) || []).filter(t => t > windowStart);

    if (timestamps.length >= maxRequests) {
      this.hits.set(key, timestamps);
      return { allowed: false, count: timestamps.length };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return { allowed: true, count: timestamps.length };
  }
}

const memoryLimiter = new InMemoryRateLimiter();

let redis: Redis | null = null;
let isRedisAvailable = false;
let redisWarningLogged = false;

const redisEnabled = config.redis.enabled !== false && process.env.REDIS_ENABLED !== 'false';

if (redisEnabled) {
  try {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) {
          if (!redisWarningLogged) {
            console.warn(`[VoiceAI] Redis connection offline at ${config.redis.host}:${config.redis.port}. Falling back to in-memory rate limiting.`);
            redisWarningLogged = true;
          }
          return 30000; // Slow backoff check every 30 seconds
        }
        return Math.min(times * 1000, 3000);
      },
    });

    redis.on('connect', () => {
      isRedisAvailable = true;
      if (redisWarningLogged) {
        console.log(`[VoiceAI] Reconnected to Redis at ${config.redis.host}:${config.redis.port}`);
        redisWarningLogged = false;
      }
    });

    redis.on('ready', () => {
      isRedisAvailable = true;
    });

    redis.on('close', () => {
      isRedisAvailable = false;
    });

    redis.on('error', (err) => {
      isRedisAvailable = false;
      if (!redisWarningLogged) {
        const msg = (err as any)?.code || err.message || 'Connection refused';
        console.warn(`[VoiceAI] Redis unavailable (${msg}) at ${config.redis.host}:${config.redis.port}. Using in-memory rate limiting.`);
        redisWarningLogged = true;
      }
    });

    // Attempt initial connect asynchronously without throwing unhandled rejection
    redis.connect().catch((err) => {
      isRedisAvailable = false;
      if (!redisWarningLogged) {
        const msg = (err as any)?.code || err.message || 'Connection refused';
        console.warn(`[VoiceAI] Redis unavailable (${msg}) at ${config.redis.host}:${config.redis.port}. Using in-memory rate limiting.`);
        redisWarningLogged = true;
      }
    });
  } catch (err) {
    isRedisAvailable = false;
    redis = null;
  }
}

let instanceCounter = 0;

export const rateLimiter = (options: {
  windowMs?: number;
  maxRequests?: number;
  prefix?: string;
  keyGenerator?: (req: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
} = {}) => {
  const windowMs = options.windowMs || config.rateLimit.windowMs;
  const maxRequests = options.maxRequests || config.rateLimit.maxRequests;
  const prefix = options.prefix || `inst_${++instanceCounter}`;
  const keyGenerator = options.keyGenerator || defaultKeyGenerator;

  return async (req: any, res: any, next: any) => {
    const key = `ratelimit:${prefix}:${keyGenerator(req)}`;
    const now = Date.now();

    let allowed = true;
    let count = 0;

    if (isRedisAvailable && redis) {
      try {
        const luaScript = `
          local key = KEYS[1]
          local now = tonumber(ARGV[1])
          local window = tonumber(ARGV[2])
          local limit = tonumber(ARGV[3])
          local windowStart = now - window
          
          -- Remove expired entries
          redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
          
          -- Count current requests
          local count = redis.call('ZCARD', key)
          
          if count >= limit then
            return {0, count}
          end
          
          -- Add new request
          redis.call('ZADD', key, now, now .. ':' .. math.random())
          redis.call('EXPIRE', key, math.ceil(window / 1000))
          
          return {1, count + 1}
        `;
        
        const result = await redis.eval(luaScript, 1, key, now, windowMs, maxRequests);
        const [allowedNum, countNum] = result as [number, number];
        allowed = Boolean(allowedNum);
        count = Number(countNum);
      } catch {
        // Fall back to in-memory limiter on Redis error
        const memResult = memoryLimiter.check(key, windowMs, maxRequests);
        allowed = memResult.allowed;
        count = memResult.count;
      }
    } else {
      // In-memory rate limiting
      const memResult = memoryLimiter.check(key, windowMs, maxRequests);
      allowed = memResult.allowed;
      count = memResult.count;
    }

    const remaining = Math.max(0, maxRequests - count);
    const resetTime = now + windowMs;

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());

    if (!allowed) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          retryAfter: Math.ceil(windowMs / 1000),
        },
      });
    }

    next();
  };
};

function defaultKeyGenerator(req: any): string {
  return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

export const strictRateLimiter = rateLimiter({
  prefix: 'strict',
  windowMs: 60000, // 1 minute
  maxRequests: 30,
});

export const authRateLimiter = rateLimiter({
  prefix: 'auth',
  windowMs: 900000, // 15 minutes
  maxRequests: 5,
  keyGenerator: (req) => `${req.ip}`,
});

export const apiRateLimiter = rateLimiter({
  prefix: 'api',
  windowMs: 60000, // 1 minute
  maxRequests: 1000,
});

export default rateLimiter;