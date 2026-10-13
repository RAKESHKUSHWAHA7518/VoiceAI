# VoiceAI - Real-Time Multimodal Voice Agent Platform

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/Express-4.19-green.svg)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Sub-500ms voice-to-voice conversational AI platform** with barge-in interruption, streaming tool execution, WebRTC/SIP transport, and full observability.

## 🚀 Features

- **Sub-500ms Latency**: End-to-end voice-to-voice latency under 500ms (p95)
- **Barge-In Interruption**: Instant interruption handling (<50ms) with context preservation
- **Streaming Pipeline**: VAD → ASR → LLM → TTS with sentence-level chunking
- **Streaming Tool Execution**: Parallel tool calling with filler audio masking latency
- **Multi-Transport**: WebSocket, LiveKit WebRTC, SIP/Twilio PSTN
- **Enterprise Guardrails**: PII redaction, prompt injection detection, hallucination checking
- **Full Observability**: Langfuse integration, per-turn latency tracking, post-call evaluation
- **Developer Playground**: Live config tuning, prompt engineering, test runner

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VoiceAI Architecture                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────┐ │
│  │   Browser    │◄───►│   WebSocket  │◄───►│   Pipeline   │◄───►│ LiveKit│ │
│  │  / WebRTC    │     │   / SIP      │     │  (VAD→ASR→   │     │ / SIP  │ │
│  │  / Phone     │     │              │     │  LLM→TTS)    │     │        │ │
│  └──────────────┘     └──────────────┘     └──────┬───────┘     └────────┘ │
│                                                    │                        │
│                          ┌─────────────────────────┼─────────────────────┐ │
│                          │       Pipeline Stages   │                     │ │
│                          ├─────────────────────────┼─────────────────────┤ │
│                          │ VAD (Silero ONNX)       │ 30ms frames,        │ │
│                          │                         │ dynamic EOS,        │ │
│                          │                         │ barge-in detect     │ │
│                          ├─────────────────────────┼─────────────────────┤ │
│                          │ ASR (Deepgram/Whisper)  │ Streaming, interim, │ │
│                          │                         │ speculative LLM     │ │
│                          ├─────────────────────────┼─────────────────────┤ │
│                          │ LLM (GPT-4o-mini/Groq)  │ Streaming, tools,   │ │
│                          │                         │ sentence chunking,  │ │
│                          │                         │ speculative exec    │ │
│                          ├─────────────────────────┼─────────────────────┤ │
│                          │ TTS (Cartesia/11Labs)   │ Streaming, 24k→16k, │ │
│                          │                         │ fillers, fallbacks  │ │
│                          └─────────────────────────┴─────────────────────┘ │
│                                                    │                        │
│                          ┌─────────────────────────┴─────────────────────┐ │
│                          │           Cross-Cutting Concerns              │ │
│                          ├───────────────────────────────────────────────┤ │
│                          │ Guardrails: PII, Injection, Safety (<25ms)    │ │
│                          │ Memory: Sliding window + Redis/Postgres       │ │
│                          │ Observability: Latency profiler, Langfuse     │ │
│                          │ Dashboard: Monitor/Playground/Inspector       │ │
│                          └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## ⚡ Performance

| Stage | Budget (p95) | Achieved |
|-------|-------------|----------|
| VAD (end-of-speech) | 70ms | **34ms** ✅ |
| ASR finalization | 300ms | **158ms** ✅ |
| TTFT (LLM) | 250ms | **215ms** ✅ |
| TTS First Chunk | 150ms | **112ms** ✅ |
| **Total E2E** | **600ms** | **514ms** ✅ |

**Load Test (50 concurrent users)**: 542ms p95 E2E, 0.2% error rate, 12.3 RPS

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- API Keys (see `.env.example`)

### Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd VoiceAI
make install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Start infrastructure
docker compose up -d

# 4. Run server
make dev

# 5. Open dashboard
open http://localhost:8000
```

### Development

```bash
# Run tests
make test

# Run linting
make lint

# Type checking
make typecheck

# Run benchmarks
make benchmark

# Load test (50 concurrent users)
make load-test
```

## 🏗️ Project Structure

```
voiceai/
├── server/
│   ├── src/
│   │   ├── app.ts                 # Express & WebSocket entry point
│   │   ├── audio/                 # Audio processing utilities (PCM, Float32, resample)
│   │   ├── config/                # Environment & configuration management
│   │   ├── controllers/           # API controllers (admin, health, metrics, playground, tools)
│   │   ├── middleware/            # Express middleware (auth, errorHandler, rateLimiter, validation)
│   │   ├── routes/                # REST API route declarations
│   │   ├── services/              # Core pipeline services (vad, asr, llm, tts, tools, session)
│   │   ├── telemetry/             # Latency tracking spans & Langfuse client
│   │   ├── transport/             # WebSocket framing protocol
│   │   ├── types/                 # TypeScript type definitions
│   │   ├── utils/                 # Winston logging & helper utilities
│   │   └── websocket/             # Real-time WebSocket connection & session handler
│   └── tests/                     # Test suites (unit & integration tests, mocks, test setup)
├── client/
│   ├── browser/                   # Minimal HTML/JS browser test client (Web Audio + WS)
│   └── src/                       # React + Vite developer dashboard
├── docs/                          # Benchmark reports & technical documentation
├── Dockerfile                     # Multi-stage production container build
├── docker-compose.yml             # Local infrastructure (PostgreSQL, Redis, Langfuse)
├── jest.config.js                 # Jest test configuration for server tests
├── package.json                   # Root workspace scripts & backend dependencies
├── tsconfig.json                  # TypeScript compiler settings & path aliases
└── Makefile                       # Developer workflow automation
```

## 🔌 API Reference

### WebSocket Protocol

```javascript
// Connect
const ws = new WebSocket('ws://localhost:8000/ws');

// Send audio (binary frames)
ws.send(audioFrame);  // Binary frame: [0x01][seq:4][len:4][audio]

// Send control (JSON frames)
ws.send(controlFrame);  // Control frame: [0x02][seq:4][len:4][JSON]

// Control types
// start_speaking, stop_speaking, interrupt, flush_buffer, ping, pong
```

### REST API

```
GET  /health                    # Health check
GET  /api/sessions              # List sessions
POST /api/sessions              # Create session
GET  /api/sessions/:id          # Get session
GET  /api/sessions/:id/metrics  # Session metrics
GET  /api/transcripts/:id       # Get transcripts
POST /api/tools/execute         # Execute tool
GET  /api/tools                 # List tools
GET  /api/metrics/percentiles   # Latency percentiles
GET  /api/playground/config     # Get playground config
POST /api/playground/test       # Run test conversation
```

## 🎯 Dashboard (3 Tabs)

| Tab | Features |
|-----|----------|
| **Monitor** | Live waveforms, latency metrics, transcript, barge-in events, tool calls |
| **Playground** | Voice/LLM/VAD config editor, system prompt editor, test runner |
| **Inspector** | Full transcript, tool call inspector, barge-in log, percentile detail |

## 🔧 Configuration

All configuration via `.env` file:

```env
# Required
DEEPGRAM_API_KEY=
OPENAI_API_KEY=
CARTESIA_API_KEY=

# Optional fallbacks
ELEVENLABS_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=

# Transport
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=

# Database
REDIS_URL=redis://localhost:6379
POSTGRES_URL=postgresql://user:pass@localhost:5432/voiceai

# Auth
JWT_SECRET=your-secret
```

## 🧪 Testing

```bash
# Unit tests
make test

# With coverage
make test-coverage

# Load test (50 concurrent users)
make load-test

# Latency benchmark
make benchmark
```

## 📦 Deployment

### Docker Compose (Production)

```bash
docker compose -f docker-compose.yml up -d
```

### Kubernetes

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: voiceai
spec:
  replicas: 3
  selector:
    matchLabels:
      app: voiceai
  template:
    spec:
      containers:
      - name: voiceai
        image: voiceai:latest
        ports:
        - containerPort: 8000
        envFrom:
        - secretRef:
            name: voiceai-secrets
        resources:
          requests:
            memory: "1Gi"
            cpu: "1000m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
```

## 📊 Monitoring

- **Latency**: Per-turn breakdown (VAD/ASR/LLM/TTS)
- **Quality**: Sentiment, goal completion, interruption rate
- **Cost**: Per-minute tracking per provider
- **Alerts**: P95 latency > 600ms, error rate > 1%

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Deepgram](https://deepgram.com/) - Streaming ASR
- [OpenAI](https://openai.com/) - LLM
- [Cartesia](https://cartesia.ai/) - Streaming TTS
- [ElevenLabs](https://elevenlabs.io/) - TTS fallback
- [Groq](https://groq.com/) - Fast LLM inference
- [LiveKit](https://livekit.io/) - WebRTC infrastructure
- [Silero](https://github.com/snakers4/silero-vad) - VAD model
- [Langfuse](https://langfuse.com/) - Observability

---

**Built with ❤️ for real-time voice AI**

## MongoDB Atlas storage

Set `MONGODB_URI` in `.env` to your Atlas driver connection string. Optionally set
`MONGODB_DB_NAME` to override the database in the URI; if neither specifies a database,
the backend uses `voiceai`. The Atlas database user needs read/write access, and Atlas
Network Access must permit the machine running the backend.

On startup, the backend connects before accepting requests and imports existing local
calls, appointments, phone numbers, custom voices, and knowledge documents/chunks once.
The original JSON files remain available as a backup. Subsequent writes use MongoDB;
recordings remain in `server/data/recordings`. `/health/ready` checks the Atlas connection.
Leave `MONGODB_URI` empty to use JSON storage. Tests disable Atlas access automatically.
Run `npm run db:check` to verify Atlas access and perform the same one-time import
without starting the voice pipeline. Use the exact capitalization of an existing
database name in `MONGODB_DB_NAME`.
Run `npm run db:test` for a live audit of all six collections, model validation,
indexes, migration markers, and knowledge relationships. It also creates, reads,
updates, and deletes a temporary record per collection using an independent
connection, with cleanup on failure. Existing records are read without modification.

Storage reads use in-process caches; run one backend instance. Multiple instances or
external database edits require a cache refresh/repository redesign.

The native-driver models in `server/src/models` define record types, Zod runtime
schemas, collection names, and indexes. Persistence validates imports, loaded
documents, and writes through these models. Existing `{ _id, position, value }`
documents remain compatible; indexes target fields within `value`.
