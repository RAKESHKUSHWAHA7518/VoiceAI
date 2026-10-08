import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { z } from 'zod';
import { ValidationError } from '../types';

export const validate = (schema: AnyZodObject) => 
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        throw new ValidationError('Validation failed', { errors });
      }
      next(error);
    }
  };

// Common validation schemas
const createSessionSchema = z.object({
  body: z.object({
    userId: z.string().uuid().optional(),
    config: z.object({
      vadThreshold: z.number().min(0).max(1).optional(),
      sosDebounceMs: z.number().int().positive().optional(),
      eosTimeoutMs: z.number().int().positive().optional(),
      llmModel: z.string().optional(),
      llmTemperature: z.number().min(0).max(2).optional(),
      ttsProvider: z.enum(['cartesia', 'elevenlabs', 'kokoro']).optional(),
      ttsVoiceId: z.string().optional(),
      systemPrompt: z.string().optional(),
    }).optional(),
  }),
});

const updatePlaygroundConfigSchema = z.object({
  body: z.object({
    voiceId: z.string().optional(),
    llmModel: z.string().optional(),
    llmTemperature: z.number().min(0).max(2).optional(),
    vadThreshold: z.number().min(0).max(1).optional(),
    vadSosDebounceMs: z.number().int().positive().optional(),
    vadEosTimeoutMs: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }),
});

const runPlaygroundTestSchema = z.object({
  body: z.object({
    text: z.string().min(1).max(5000),
  }),
});

const toolCallSchema = z.object({
  body: z.object({
    toolName: z.string(),
    arguments: z.record(z.unknown()),
    callId: z.string(),
  }),
});

const sessionIdSchema = z.object({
  params: z.object({
    sessionId: z.string().uuid(),
  }),
});

const metricsQuerySchema = z.object({
  query: z.object({
    window: z.coerce.number().int().positive().max(10000).optional(),
    limit: z.coerce.number().int().positive().max(1000).optional(),
  }),
});

const paginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const schemas = {
  createSession: createSessionSchema,
  updatePlaygroundConfig: updatePlaygroundConfigSchema,
  runPlaygroundTest: runPlaygroundTestSchema,
  toolCall: toolCallSchema,
  sessionId: sessionIdSchema,
  metricsQuery: metricsQuerySchema,
  pagination: paginationSchema,
};

export type SchemaKey = keyof typeof schemas;