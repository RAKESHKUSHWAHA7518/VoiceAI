import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import config from './config';
import logger, { morganStream } from './utils/logger';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/errorHandler';
import { validate } from './middleware/validation';
import { schemas } from './middleware/validation';
import { rateLimiter, authRateLimiter, apiRateLimiter } from './middleware/rateLimiter';
import { authenticate, authorize, optionalAuth } from './middleware/auth';

// Routes
import healthRoutes from './routes/health';
import sessionRoutes from './routes/sessions';
import transcriptRoutes from './routes/transcripts';
import toolRoutes from './routes/tools';
import metricsRoutes from './routes/metrics';
import playgroundRoutes from './routes/playground';
import adminRoutes from './routes/admin';
import agentRoutes from './routes/agents';
import callRoutes from './routes/calls';
import telephonyRoutes from './routes/telephony';
import knowledgeRoutes from './routes/knowledge';
import hitlRoutes from './routes/hitl';
import evalRoutes from './routes/evals';
import multilingualRoutes from './routes/multilingual';
import securityRoutes from './routes/security';

// WebSocket
import { WebSocketHandler } from './websocket/handler';
import { TwilioMediaStreamHandler } from './transport/twilio_stream';

// Pipeline
import { PipelineManager } from './services/pipeline';

import fs from 'fs';
import path from 'path';

const app = express();
const server = createServer(app);

// Recordings directory
const recordingsDir = path.join(__dirname, '../data/recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Initialize pipeline manager
const pipelineManager = new PipelineManager();

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use('/recordings', express.static(recordingsDir));
app.use(morgan('combined', { stream: morganStream }));

// Rate limiting
app.use('/api/', apiRateLimiter);
app.post('/api/auth/*', authRateLimiter);
app.post('/api/playground/test', rateLimiter({ prefix: 'playground', windowMs: 60000, maxRequests: 120 }));

// Routes
app.use('/health', healthRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/playground', playgroundRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/telephony', telephonyRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/hitl', hitlRoutes);
app.use('/api/evals', evalRoutes);
app.use('/api/multilingual', multilingualRoutes);
app.use('/api/security', securityRoutes);

app.get('/api/state', (req, res) => {
  res.json({
    success: true,
    session_id: null,
    turn_id: null,
    transcript_count: 0,
    barge_in_count: 0,
    tool_calls_count: 0,
  });
});

// WebSocket for Web Clients (/ws)
const wsHandler = new WebSocketHandler(server);
const wss = wsHandler.getWss();

// WebSocket for Twilio Media Streams (/media-stream)
const twilioWss = new WebSocketServer({ server, path: '/media-stream' });
twilioWss.on('connection', (ws, req) => TwilioMediaStreamHandler.handleConnection(ws, req));

// Initialize on startup
async function initialize() {
  try {
    await pipelineManager.initialize();
    logger.info('Pipeline initialized');
  } catch (error) {
    logger.error('Failed to initialize pipeline', { error });
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
}

// Start server and initialize only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  initialize().catch((err) => {
    logger.error('Failed to initialize', { err });
    process.exit(1);
  });

  // Start server
  const PORT = config.port;
  server.listen(PORT, config.host, () => {
    logger.info(`VoiceAI server running on http://${config.host}:${config.port}`);
    logger.info(`WebSocket server running on ws://${config.host}:${config.port}/ws`);
    logger.info(`Dashboard available at http://${config.host}:${config.port}`);
    logger.info(`API docs available at http://${config.host}:${config.port}/docs`);
  });
}

export default app;