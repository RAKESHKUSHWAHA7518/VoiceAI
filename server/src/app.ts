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

// WebSocket
import { WebSocketHandler } from './websocket/handler';

// Pipeline
import { PipelineManager } from './services/pipeline';

const app = express();
const server = createServer(app);

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
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

// WebSocket
const wsHandler = new WebSocketHandler(server);
const wss = wsHandler.getWss();

// Initialize on startup
async function initialize() {
  try {
    await pipelineManager.initialize();
    logger.info('Pipeline initialized');
  } catch (error) {
    logger.error('Failed to initialize pipeline', { error });
    process.exit(1);
  }
}

// Initialize on startup
initialize().catch((err) => {
  logger.error('Failed to initialize', { err });
  process.exit(1);
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info('Shutting down gracefully', { signal });
  
  // Close WebSocket connections
  wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
  
  // Close HTTP server
  server.close(async () => {
    try {
      await pipelineManager.shutdown();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const PORT = config.port;
const HOST = config.host;

server.listen(PORT, config.host, () => {
  logger.info(`VoiceAI server running on http://${config.host}:${config.port}`);
  logger.info(`WebSocket server running on ws://${config.host}:${config.port}/ws`);
  logger.info(`Dashboard available at http://${config.host}:${config.port}`);
  logger.info(`API docs available at http://${config.host}:${config.port}/docs`);
});

export default app;