# VoiceAI studio

A voice agent portfolio project with private accounts, a React agent studio, knowledge retrieval, saved agent configurations and an embeddable conversation preview.

The default mode is a local demo. It does not make language-model requests. Live text generation can use the existing OpenAI adapter or a Groq model with a configured key. Browser speech recognition and speech synthesis provide a voice preview. Full streaming STT/TTS, production telephony and measured audible latency are not complete.

## Run locally

The previous Campaigns, Phone numbers, Evaluations and Human handoff screens are available again as clearly labeled workspace simulations. Live monitor, Inspector and Analytics use private workspace data. Open **All features** (`/features`) for the complete preservation register and remaining integration limits. See [feature preservation](docs/FEATURE_PRESERVATION.md).

Use Node.js 20 or later. Install backend and frontend dependencies with `npm ci` and `npm --prefix client ci`. Copy `.env.example` to `.env` and configure values locally.

For a zero-provider-cost run, set:

```env
VOICEAI_RUNTIME_MODE=demo
VOICEAI_LEGACY_DEMO=false
MONGODB_URI=
REDIS_ENABLED=false
```

Start the backend with `npm run dev`, then the frontend with `npm run client:dev`. Open http://localhost:5173 and create your own account. Each account gets two editable starter agents. No shared demo login is required.

Accounts and agent configuration use the existing MongoDB layer when MONGODB_URI is configured, and local JSON files otherwise. One backend instance is supported. Local account and deployment files are ignored by Git. Keep all data and credentials out of public repositories and container images.

## Try the full development flow

1. Create an account and select or create an agent.
2. Choose Connect knowledge on that agent. Paste a FAQ or upload a text-based PDF, connect the source and check passage matching.
3. Choose Test this agent or Talk to agent. Demo responses are explicitly labeled. Real browser microphone acceptance remains a separate check.
4. Choose Publish agent or Manage website widget on the agent card. For a local presentation, keep local preview enabled and open the widget preview.
5. To embed it later, add the exact allowed website address and paste the generated script into that website. Visitors get isolated, short-lived conversation tokens. Text and browser voice controls are available.
6. Disable the widget from the same panel to revoke visitor access.

Publishing snapshots the agent configuration. Knowledge remains linked to the agent and is not versioned. Visitor limits are development controls stored in memory: 20 starts per deployment per UTC day, 10 turns per guest session and 10-minute access. Limits reset on restart. Do not expose paid public usage before durable budget controls and production validation are complete.

## Live language model testing

Set `VOICEAI_RUNTIME_MODE=live` on the server. Configure OPENAI_API_KEY for the existing OpenAI models, or GROQ_API_KEY and select a model prefixed with `groq/` in the agent editor. Failures are returned explicitly; live conversations do not substitute mock responses. External actions remain disabled in the new runtime.

Public live widget sessions stay disabled unless `VOICEAI_PUBLIC_LIVE=true` is deliberately enabled. Use the signed-in playground while validating providers. Keep keys on the server. Configuring a key does not establish that it works or has available credit.

## Container demo

`docker compose -f docker-compose.demo.yml up --build` runs a local browser demo at http://localhost:5173 with persistent local data and no provider keys. It deliberately uses development cookies over localhost HTTP. Production needs HTTPS and Secure cookies. The larger original Compose stack is retained for infrastructure experiments, not as proof of production readiness.

## Validation

- `npm run typecheck` checks backend TypeScript.
- `npm run client:build` builds the studio and widget.
- `npm test -- --runInBand --cacheDirectory .jest-cache` runs unit and HTTP integration tests. Local HTTP networking must be allowed.
- `npm run benchmark` measures authenticated text streaming with AUTH_COOKIE and AGENT_ID set in your environment. It reports failures and never invents first-audio measurements. This is not a microphone or audible-latency benchmark.

The old claims of sub-500 ms production latency and 50-user load performance are unverified. Historical reports in docs are retained as prior project material, not current validation evidence.

## Implementation status

See [phase status](docs/IMPLEMENTATION_STATUS.md), [review and roadmap](docs/VOICEAI_PLATFORM_REVIEW_AND_BUILD_PLAN.md), and [free setup and costs](docs/FREE_START_AND_SERVICE_COSTS.md).

For the polished small-audience presentation path, see [showcase release](docs/SHOWCASE_RELEASE.md) and [source inventory](docs/SOURCE_INVENTORY.md).

Account mode intentionally gates shared legacy dashboards, raw recording links, custom tool execution, voice cloning and unauthenticated WebSockets. `VOICEAI_LEGACY_DEMO=true` is an explicit local simulator bypass and is ignored in production; do not expose it publicly. Existing simulator tests use this bypass, while separate integration tests exercise the private account boundary.
