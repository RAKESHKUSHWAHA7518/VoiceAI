import speechRoutes, { handleSpeechUpgrade } from './routes/speech';
import workspaceToolsRoutes, { privatePhoneRouter, privateCalendarRouter } from './routes/workspace_tools';
import { dataPath } from './config/storage';
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
import campaignRoutes from './routes/campaigns';
import providerRoutes from './routes/providers';
import calendarRoutes from './routes/calendar';
import voiceRoutes from './routes/voices';
import authRoutes from './routes/auth';
import conversationRoutes from './routes/conversations';
import publicRoutes from './routes/public';
import { platformAccess } from './middleware/platformAccess';
import { legacyDemo } from './middleware/workspace';

// WebSocket
import { WebSocketHandler } from './websocket/handler';
import { TwilioMediaStreamHandler } from './transport/twilio_stream';

// Pipeline
import { PipelineManager } from './services/pipeline';
import { initializeDatabase, closeDatabase } from './services/database';

import fs from 'fs';
import path from 'path';
import { mountStudio } from './routes/studio';

const app = express();
const server = createServer(app);

// Recordings directory
const recordingsDir = dataPath('recordings');
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
app.use('/recordings', (req, res, next) => legacyDemo() ? next() : res.sendStatus(404), express.static(recordingsDir));
app.use(morgan('combined', { stream: morganStream }));

// Rate limiting
app.use('/api/', apiRateLimiter);
app.use('/api/', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// Credential throttling must never prevent an authenticated user signing out.
app.post(['/api/auth/signup', '/api/auth/login'], authRateLimiter);
app.post('/api/playground/test', rateLimiter({ prefix: 'playground', windowMs: 60000, maxRequests: 120 }));

// Routes
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', platformAccess);
app.use('/api/workspace-tools', workspaceToolsRoutes);
app.use('/api/telephony', (req, res, next) => legacyDemo() ? next() : privatePhoneRouter(req, res, next));
app.use('/api/calendar', (req, res, next) => legacyDemo() ? next() : privateCalendarRouter(req, res, next));
app.use('/api/conversations', conversationRoutes);
app.use('/api/conversations', speechRoutes);
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
app.use('/api/campaigns', campaignRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/voices', voiceRoutes);

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

// Return storage failures through the shared API error handler.
if (process.env.VOICEAI_SERVE_CLIENT === 'true') mountStudio(app, path.resolve('client/dist'));
app.use(notFoundHandler);
app.use(errorHandler);

// WebSocket for Web Clients (/ws)
const wsHandler = new WebSocketHandler(server, true);
const wss = wsHandler.getWss();

// WebSocket for Twilio Media Streams (/media-stream)
const twilioWss = new WebSocketServer({ noServer: true, verifyClient: () => legacyDemo() });
server.on('upgrade', (req, socket, head) => {
  if (handleSpeechUpgrade(req, socket, head)) return;
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const target = pathname === '/ws' ? wss : pathname === '/media-stream' ? twilioWss : null;
  if (!target) { socket.destroy(); return; }
  target.handleUpgrade(req, socket, head, ws => target.emit('connection', ws, req));
});

twilioWss.on('connection', (ws, req) => TwilioMediaStreamHandler.handleConnection(ws, req));

// Initialize on startup
async function initialize() {
  try {
    await initializeDatabase();
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
  initialize().then(() => {
    const PORT = config.port;
    server.listen(PORT, () => {
      logger.info(`VoiceAI server running on http://localhost:${PORT}`);
      logger.info(`WebSocket server running on ws://localhost:${PORT}/ws`);
      logger.info(`Dashboard available at http://localhost:${PORT}`);
    });
  }).catch((err) => {
    logger.error('Failed to initialize', { err });
    process.exit(1);
  });

  const shutdown = async () => {
    wsHandler.getWss().clients.forEach(socket => socket.close());
    twilioWss.clients.forEach(socket => socket.close());
    await new Promise<void>(resolve => server.close(() => resolve()));
    await closeDatabase();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export default app;
