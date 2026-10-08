import dotenv from 'dotenv';
dotenv.config();

interface Config {
  env: string;
  port: number;
  host: string;
  corsOrigin: string;
  logLevel: string;
  
  // Database
  db: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl: boolean;
    pool: {
      min: number;
      max: number;
    };
  };
  
  // Redis
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    enabled?: boolean;
  };
  
  // JWT
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  
  // API Keys
  apiKeys: {
    deepgram: string;
    openai: string;
    cartesia: string;
    elevenlabs: string;
    groq: string;
    gemini: string;
  };
  
  // LiveKit
  livekit: {
    url: string;
    apiKey: string;
    apiSecret: string;
  };
  
  // Twilio
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    webhookUrl: string;
  };
  
  // Audio
  audio: {
    sampleRate: number;
    channels: number;
    chunkMs: number;
    format: string;
  };
  
  // VAD
  vad: {
    threshold: number;
    sosDebounceMs: number;
    eosTimeoutMs: number;
  };
  
  // LLM
  llm: {
    model: string;
    temperature: number;
    maxTokens: number;
    baseUrl: string;
  };
  
  // TTS
  tts: {
    provider: string;
    voiceId: string;
    sampleRate: number;
  };
  
  // ASR
  asr: {
    provider: string;
    model: string;
    language: string;
  };
  
  // Rate Limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8000', 10),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'voiceai',
    ssl: process.env.DB_SSL === 'true',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    },
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    enabled: process.env.REDIS_ENABLED !== 'false',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  
  apiKeys: {
    deepgram: process.env.DEEPGRAM_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    cartesia: process.env.CARTESIA_API_KEY || '',
    elevenlabs: process.env.ELEVENLABS_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
  },
  
  livekit: {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  },
  
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    webhookUrl: process.env.TWILIO_WEBHOOK_URL || '',
  },
  
  audio: {
    sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE || '16000', 10),
    channels: parseInt(process.env.AUDIO_CHANNELS || '1', 10),
    chunkMs: parseInt(process.env.AUDIO_CHUNK_MS || '30', 10),
    format: process.env.AUDIO_FORMAT || 'pcm16',
  },
  
  vad: {
    threshold: parseFloat(process.env.VAD_THRESHOLD || '0.6'),
    sosDebounceMs: parseInt(process.env.VAD_SOS_DEBOUNCE_MS || '120', 10),
    eosTimeoutMs: parseInt(process.env.VAD_EOS_TIMEOUT_MS || '500', 10),
  },
  
  llm: {
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '512', 10),
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  },
  
  tts: {
    provider: process.env.TTS_PROVIDER || 'cartesia',
    voiceId: process.env.TTS_VOICE_ID || '',
    sampleRate: parseInt(process.env.TTS_SAMPLE_RATE || '24000', 10),
  },
  
  asr: {
    provider: process.env.ASR_PROVIDER || 'deepgram',
    model: process.env.ASR_MODEL || 'nova-2',
    language: process.env.ASR_LANGUAGE || 'en',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
};

export default config;