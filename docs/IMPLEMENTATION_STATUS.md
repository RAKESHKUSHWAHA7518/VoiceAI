# VoiceAI implementation status

Updated 24 October 2026. The first usable private-workspace milestone is implemented. The complete production roadmap is not finished.

## What can be tested now

Create an account, sign in, edit either of two starter agents or create another, add knowledge, test retrieval, run a conversation, publish a saved agent configuration and embed its widget on an allowed website. A visitor uses a separate short-lived session and can receive text or device read-aloud without a workspace account.

Demo mode is the default and does not request model inference. Live text generation supports the existing OpenAI adapter and Groq through its compatible endpoint. No paid provider request, telephone call, subscription or public deployment was made during implementation.

## Phase status

### Current checkpoint — 24 October 2026

Overall status: **working local MVP; production release pending**. Current mode is free demo with browser-only speech. No paid services or public hosting have been activated. The next active priority is browser voice acceptance and visible session health, not a new cloud audio integration.

| Feature | Current status | Evidence or remaining check |
| --- | --- | --- |
| Accounts and private agents | Implemented, locally tested | Account isolation and persistence tests pass; recovery and email verification pending |
| Create/edit studio | Implemented, browser inspected | Three-step editor; expand keyboard and mobile acceptance |
| Knowledge and text conversations | Implemented, demo tested | Live provider quality remains unverified |
| Continuous browser conversation and spoken replies | Implemented, controller tested; audio acceptance pending | In-app recognition timed out; real Chrome/Edge speech and audible playback unverified |
| Private transcript history | Implemented, tested | Saved transcript checked in browser; account isolation tested |
| Publish and website widget | Implemented, local preview tested | Public HTTPS host integration pending |
| Usage, reliability and operations | Partial | Durable budgets, recovery, monitoring and production deployment pending |
| Telephone calls | Pending in private platform | Legacy simulation does not count as a verified real call |

### Prioritized next features

These are planned tasks, not completed features or background jobs.

| Order | Work package | Completion criteria |
| --- | --- | --- |
| 1 — Next | Reliable browser voice and session health | Visible connecting/listening/thinking/speaking/error states; microphone permission and browser guidance; real Chrome/Edge multi-turn test, silence, denied permission, interruption and clean session end. Retain browser-only speech. |
| 2 | Useful history and test results | Agent/date/status filters, transcript export, clearly labeled timing stages, failed-turn visibility and transcript retention controls. Avoid showing model response time as full voice latency. |
| 3 | Publishing confidence | Published/draft status on agent cards, version list and rollback, widget branding, retry/reconnect and clear public-host setup. Test allowed/blocked domains and revoked widgets. |
| 4 | Account and data reliability | Password recovery, email verification, atomic local writes, backup/restore drill and recoverable storage failures. Secrets remain server-side. |
| 5 | Portfolio release | A public HTTPS staging demo with durable usage limits and monitoring, repeatable acceptance checklist, architecture diagram, setup guide and short demonstration video. Confirm current costs before selecting hosting. |
| Later — separate provider decision | Streaming production audio and telephone integration | Agree on audio service and spending first; then validate streaming recognition, endpointing, streamed speech, actual audio latency and one real inbound call. No Deepgram recording fallback is authorized. |

### How this status is maintained

Use this file as the project status source. After each implementation milestone, update the feature row, validation evidence, remaining blocker and next priority. Mark work **planned**, **in progress**, **implemented / unverified**, **verified locally**, or **verified on staging** according to evidence. Preserve demo/live distinctions and record test dates; do not infer production readiness from passing simulated tests. Status updates happen when work is performed in this chat; no recurring monitoring has been scheduled.

| Roadmap phase | Implemented | Remaining release gate |
| --- | --- | --- |
| 1 Foundation and truthful demo | Validated persisted agents, saved language settings, one storage root, explicit demo/live conversation modes, typed failures, bounded text sessions, no fabricated benchmark audio metrics, corrected README claims | Real microphone-to-provider-audio acceptance and atomic storage recovery still need work |
| 2 Accounts and workspace ownership | Signup, scrypt password hashes, normalized email uniqueness, opaque hashed sessions, HttpOnly cookies, logout revocation, per-workspace agents and knowledge, two private template copies, cross-site request checks, legacy feature gates | Email verification, password reset/recovery, account lifecycle, invitation roles and an external security review are pending |
| 3 Streaming conversation runtime | Streamed model text, cancellation, ten-turn history, limits and expiry, immutable per-session agent configuration, split UTF-8/SSE handling, explicit missing-provider errors, browser speech preview without duplicate playback | This is text streaming plus browser speech, not full streaming STT/TTS or WebRTC. Real audio transport, VAD/semantic endpointing, playout acknowledgments and acoustic interruption tests are pending |
| 4 Studio and widget | Signup UI, private agent editor, simplified knowledge and test screens, saved configuration versions, allowed website origins, iframe widget, scoped guest tokens, expiry and development quotas, deployment revocation | Provider-voice widget audio, versioned knowledge, widget retry/reconnect, more accessibility tests and public-host integration are pending |
| 5 Telephone pilot | Existing carrier code remains available only in explicit local legacy demo mode | Not enabled in private workspaces. Provider configuration, verified number ownership, signed carrier upgrades/webhooks, unified runtime integration and a real inbound call are required |
| 6 Reliability and portfolio release | Backend typecheck, frontend build, 130 tests, browser flow checks, desktop/mobile screenshot inspection, persistent demo Compose configuration, non-root Debian image definition, runtime ONNX dependency classification, storage and proxy corrections | Docker engine is stopped, so image execution is unverified. Live provider, load/soak, restore/rollback, durable usage budgets, alerts, TLS and public deployment are pending |

## Validation evidence

- Backend typecheck passed.
- Frontend production build passed.
- All 130 tests passed in ten suites with localhost networking enabled. These include account isolation, hashed-session storage, revocation, immutable published configuration, origin restrictions, guest token isolation, conversation history and cancellation, explicit provider failure, split SSE/UTF-8 frames and logout during credential throttling.
- The existing legacy simulator suite remains explicitly separate through its test-only local-demo configuration. Its success is not evidence of production telephony or live provider quality.
- Browser testing uses isolated local data and no provider keys. The exercised path covers signup, two templates, agent creation, document ingestion and retrieval, conversation output, opening and closing the browser voice preview, publishing, anonymous widget response, disabling a widget, mobile layout and logout.
- Screenshot review covers sign-in, agent cards, knowledge, playground, browser voice dialog, publishing, widget and mobile layout. The headless test does not validate microphone audio or audible speech output.
- Demo Compose configuration parses successfully. Container execution was not tested because Docker Desktop's engine pipe was unavailable.

## Security and operating boundaries

Run one backend instance. Account, agent and deployment mutations are serialized within that process. MongoDB-backed operations use the existing in-process repository caches; no claim of distributed consistency is made. JSON storage still needs atomic file replacement and crash-recovery testing before production.

Session tokens stay in HttpOnly cookies for owners and in memory for widget guests. Passwords use scrypt with random salts; raw session tokens are not stored. Account responses omit password hashes and salts. Sessions expire after seven days, and logout revokes the active session. Email ownership is not yet verified, so signup must not be described as production identity assurance.

Legacy unowned agent records are not silently assigned to the first new account. They remain outside private workspace views. Shared legacy tools, custom voices, raw recording links and unauthenticated WebSockets remain gated from account mode. Restored showcase engines now have separate workspace state; see the restoration checkpoint below. Current browser/widget sessions do not execute external actions.

Private conversation sessions last up to thirty minutes with a maximum of five sessions per workspace, 100 turns per session, a 45-second generation deadline and bounded text/history. A guest token lasts ten minutes and permits ten messages. Widget session starts are limited to twenty per deployment per UTC day. These counters are development limits stored in memory and reset with the server. Public live model sessions default to disabled; durable spending controls are required before opening paid traffic.

Publishing snapshots instructions, model, voice and other agent configuration. Documents remain linked by agent ID, so editing knowledge affects later retrieval; knowledge is not an immutable versioned artifact yet. Disabling a deployment revokes its visitor sessions; deleting an agent disables its deployments and closes its conversation sessions.

## Future production audio gate

After the browser-only milestone and a separate provider decision, complete and validate real streaming audio using one chosen media runtime. Keep the tested private accounts, configuration versions and widget session boundary, and add real STT, endpointing, phrase-level TTS, playback timing and cancellation behind them. Then integrate telephone calls with that same runtime rather than extending the separate legacy paths.

A free LiveKit project is the recommended evaluation path from the review, but it has not been connected or integrated in this implementation. Existing Deepgram and Cartesia configuration values have not been checked for valid credentials or balances. Enable providers only when ready to validate actual calls and their usage.

For the current free demo, use the startup instructions in README.md or the local-only docker-compose.demo.yml when the Docker engine is running. For production, satisfy every remaining gate above; do not claim sub-500 ms audio latency, multi-instance readiness or a compliance certification from this milestone.

## Browser testing and interface follow-up (24 October 2026)

- Added an obvious Talk to agent action, a large microphone control, browser speech recognition, spoken replies, interruption and optional continued listening. The sign-in page also offers an account-free demo.
- Speech stays browser-only by user choice. No recorded-audio upload or Deepgram transcription fallback is included. Recognition depends on browser support and permission; a startup timeout gives Chrome/Edge guidance. Browser speech services may use their own remote recognition service.
- Added private durable transcript history at /history, account-scoped list/detail APIs, and isolation regression tests. Guest previews do not save transcripts.
- Rebuilt create/edit as a three-step editor, and publishing as website selection, version publication, preview and embed. Local preview works without a public website; public HTTPS hosting remains a separate deployment step.
- Added widget microphone controls, spoken replies by default and iframe microphone/autoplay delegation. No microphone recordings are stored by this app.
- Validation: backend typecheck, frontend production build and all 117 tests in eight suites passed. In-app browser checks confirmed the editor, streamed reply, saved transcript, local publishing and embedded mic control. Actual microphone input and audible playback have not been verified; in-app recognition did not start during the check. Use Chrome or Edge for the real voice acceptance test.



## Continuous browser conversation milestone — 24 October 2026

Status: implemented and locally tested with simulated speech events; real microphone acceptance remains pending.

- Studio, account-free demo and public widget share one continuous conversation controller. Start conversation begins recognition; after the microphone connects, the agent greets the visitor. Recognition stays active while generating and speaking so the visitor can continue without clicking each turn.
- Final recognition segments are grouped with a 750 ms pause before submission. Interim text is visible but never committed as a completed user turn. Normal recognition disconnects reconnect with backoff; repeated rapid failures and permission errors pause visibly.
- Recognized user text during a reply cancels playback or generation and invalidates stale callbacks. Playback echo matching is only a heuristic; headphones are recommended. This is recognition-driven interruption, not validated acoustic VAD or production echo cancellation. Some browsers may suspend recognition during synthesis.
- Pause, resume, end and close stop recognition, synthesis, timers and outstanding requests. Playback and microphone startup failures have explicit recovery messages.
- Browser-only speech remains the constraint. No recorded-audio upload or new paid provider integration was added. Browser-vendor speech services may perform recognition remotely.
- Validation: all 123 tests passed in nine suites; six new deterministic tests cover repeated turns, final/interim grouping, interruption, stale callbacks, echo suppression, silence reconnect, permission failure and cleanup. Backend typecheck and frontend build passed. In-app UI confirms start/connecting/resume states and a widget response; its speech service still times out. Real Chrome/Edge microphone and audible playback acceptance is not complete.
- Next acceptance: use headphones in Chrome/Edge; start once; complete three turns without clicking; interrupt a long reply; remain silent and resume speaking; pause/resume; end and verify the microphone indicator stops. Do not mark real voice acceptance complete until these pass.

Implementation references: shared/continuousVoice.ts, client/src/hooks/useContinuousVoice.ts, server/tests/continuous_voice.test.ts.
Speech API references: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition and https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api (checked 24 October 2026).


## Previous-screen restoration — 24 October 2026

User-confirmed scope: restore previous screens and working features first. All ten original navigation areas are visible again, alongside Appointments, separate Analytics and an All features register. Current voice controls, private history, agent builder, knowledge and publishing remain in place.

Campaigns, evaluations and human handoff retain their original showcase workflows using isolated per-workspace engines. These are labeled simulations, not live provider integrations, and reset after a server restart. Phone registry records, manual appointments and mock tool fixtures are persisted privately. Phone/dialpad actions are intercepted by a local simulator and cannot reach a carrier using the private workspace routes.

Live monitor and analytics use actual private session/history metadata. Inspector supports transcript JSON, export and mock tool fixtures. The original global security/vault examples, rewind/waterfall simulator and voice-cloning code remain retained but gated rather than exposing shared data or fabricated production claims. The complete feature-by-feature state is maintained in FEATURE_PRESERVATION.md and the /features screen.

Validation: backend typecheck, frontend build, and all 126 tests in nine suites passed. Regression checks cover cross-account access to campaigns, handoff calls, evaluation runs, number registry, mock tools and calendar cancellation; calendar conflicts return 409. No real carrier call, paid model request or recorded audio upload was made. Real browser microphone acceptance remains pending.


## Showcase release and connected knowledge — 24 October 2026

Scope: a polished, reliable small-audience demonstration, rather than a claim of high-volume production infrastructure. See SHOWCASE_RELEASE.md for the presentation path and SOURCE_INVENTORY.md for audit scope.

The studio now uses a consistent light workspace and violet controls. Agent cards show actual indexed source counts, configuration/publication state and direct knowledge, test and widget actions. The four-step setup checklist uses saved server data, not a fabricated readiness score. It is a setup checklist, not production certification.

Knowledge selection travels from the agent card into the workbench and selected agent context. The page supports paste/upload modes, searchable/error status, source previews, deletion and source matching. Test this agent continues into that same agent. Playground results are filtered by agent. Navigation returns to the top of each page and focuses its content for keyboard users.

A dependency mismatch in PDF processing was fixed: installed pdf-parse v2 is called with its current interface, temporary uploads and parser workers are cleaned up, empty/unreadable text is rejected, and malformed PDFs no longer become binary text sources. Existing legacy screens and the preservation register remain available.

Validation: all 130 tests passed in ten suites; backend typecheck and frontend production build passed. Actual local PDF extraction, browser PDF upload/indexing, source matching, grounded demo response, agent switching and desktop/phone layouts were checked. Browser speech remains implemented but real microphone/playback acceptance is still pending. No provider purchase, paid call, public hosting or recorded audio upload was made.

Deployment audit follow-up: proxy document uploads allow 26 MB for 25 MB documents plus multipart overhead, streaming API buffering is disabled, and the production npm command uses a portable Node entry point included in the image definition. Syntax/Compose checks pass; Docker runtime execution remains unverified.


## Agent tool selection restored — 24 October 2026

Create/Edit agent now includes a fourth Tools step with built-in demo definitions and private workspace mock fixtures. Assignments can be added and removed; unavailable saved IDs are preserved unless explicitly unchecked. Loading failures have a retry control. Custom mock tool creation remains in Inspector. Browser runtime tool execution is still unavailable. Frontend production build passed; browser save, reload, reopen and removal were verified on the isolated QA workspace, then its original selections were restored.

## Focused core review — 24 October 2026

New priority is Agents, Tools, Knowledge, Conversation history and Playground. Earlier screens remain preserved. CORE_WORKSPACE_REVIEW.md records the source audit, ordered completion gates and Gemini/LiveKit placement. Identified gaps: playground does not render the available stream deltas; conversation tools are disabled; Gemini and LiveKit placeholders are not wired into the active conversation path. Twelve focused agent, conversation-contract/cancellation and PDF tests passed in three suites; provider output is mocked in those tests. No live provider, microphone or LiveKit validation was performed.

## Private conversation tool execution — 24 October 2026

Assigned built-in tools now execute through a bounded private runner as explicit simulations; workspace fixtures return their configured mock JSON. Legacy calendar/transfer handlers are deliberately not invoked. Model-selected calls are validated, checked against current workspace/assignment and returned through proper assistant-tool protocol messages. Demo mode supports /tool NAME JSON for deterministic testing without a paid model. Results and errors appear in playground and completed conversation history. Public/widget sessions keep tools disabled to avoid expanding public access to private fixtures. External integrations, live model function-calling acceptance and failed/interrupted turn audit retention remain pending.

Validation: all 136 tests passed in 11 suites; backend typecheck and frontend build passed. Browser acceptance confirmed an assigned booking simulation result in playground and its saved tool event in private conversation history. Tests cover rejected assignments/arguments, fixture workspace isolation and deletion, cancellation, model result feedback and tools disabled in public sessions. Live provider function calling was contract-tested with a mocked model only.

## Streaming playground and Gemini — 24 October 2026

Progressive text/tool events, Stop/New conversation controls, stale-request isolation, Gemini server-key routing, strict finished-call argument handling and provider errors are implemented. Playground shows retrieved reference titles; history stores tested configuration and completed/error/interrupted outcomes. Public tools stay disabled and external actions remain simulated. All 144 tests passed in 13 suites; source-reader/provider contracts use local mocks. Browser checks confirmed grounded references, tool output, reset, configuration history and Gemini model selection. Live Gemini and physical microphone acceptance remain pending. Setup: GEMINI_AND_STREAMING.md.

## Authorized cloud speech — 24 October 2026

The user explicitly authorized live microphone streaming to Deepgram, superseding the earlier browser-only preference. Private voice tests now use an authenticated one-use-ticket websocket proxy for Deepgram and bounded Cartesia WAV generation for saved replies. Long-lived keys remain server-side. Local cloud speech is enabled; the preview still uses the demo answer engine. 145 tests pass; typecheck/build pass. Short synthetic provider requests validated both keys and finalized direct Deepgram transcription; the app proxy relayed transcript events. Physical microphone startup in the in-app browser was denied, so Chrome/Edge manual acceptance remains pending. Limits, data flow and full evidence: CLOUD_SPEECH.md.

## Chrome microphone startup fix — 24 October 2026

Chrome was using the Vite development page on localhost:5174. Added the missing /speech WebSocket proxy, stage-specific microphone progress and errors, and a 30-second cloud startup allowance. After the user granted microphone permission, Chrome visibly reached Listening — speak naturally / Microphone connected to Deepgram. This verifies physical microphone startup and provider connection, not yet a complete spoken question/answer or acoustic interruption. Frontend build and seven targeted lifecycle tests pass.

## Tool and provider failure corrections — 24 October 2026

Removed the generic legacy handler path from private conversation tools and restricted registry discovery to supported built-ins plus workspace-owned fixtures. Booking/transfer actions stay explicit simulations. Removed automatic model/provider fallback: a failed stream ends the turn, so queued tool calls are discarded and no hidden additional model requests occur. Simulation labeling remains in prompts after tool feedback. Backend typecheck and 15 focused tests passed, including production-mode handler denial and failure after a queued tool call. No paid model calls were used.

## History, segmented speech and publish modes — 24 October 2026

Completed turns are committed only after history persistence succeeds. Save failure returns HISTORY_SAVE_FAILED without advancing conversation context. Cartesia playback splits saved replies into authorized segments of at most 1500 characters, with sequential playback, cancellation and visible provider errors; the existing per-workspace credit limit remains enforced. Public deployments now store an explicit demo/live runtime mode. Demo is the default, including older deployments without a stored mode; these widgets work independently of private live mode. Live publishing and guest turns remain gated by VOICEAI_PUBLIC_LIVE, with the publishing UI displaying server availability. No paid model access was enabled. All 152 tests passed in 15 suites; backend typecheck and frontend build pass. New tests cover save-failure recovery, long speech authorization, demo publishing in private live mode and live-session revocation. Browser inspection confirmed the new publishing choices and credit disclosure.

## Cloudinary recordings and centralized widget history — 24 October 2026

Demo recording workflow implemented. See RECORDING_PLAN.md for exact scope, limits and incomplete crash recovery. Cloudinary keys verified without disclosure using disposable audio/image uploads; private playback and unsigned-access denial passed and both assets were deleted. Voice sessions with Cartesia playback mix both sides and upload on normal end; native browser voice remains transcript-only. Owner-only History supports audio playback/download/deletion and unique IDs. Published widget transcripts now persist with deployment metadata. Public cloud TTS stays behind explicit live publishing; no public live flag was enabled automatically. Physical spoken recording acceptance remains manual.

Verification: all 154 tests in 15 suites passed; backend typecheck, frontend production build and diff whitespace checks passed. Chrome inspection confirmed the updated History IDs/detail view and the cloud voice recording disclosure. No microphone was opened during UI inspection; a real spoken two-sided recording is not yet acceptance-tested. Cloudinary adapter verification used a synthetic tone and one-pixel image only, and deleted both.

## Recording review fixes — 24 October 2026

Fixed all three review findings. Recording startup now owns an abortable attempt, stops pending/late microphone tracks and returns cancellation to both Playground and widget callers; closing cannot resume the voice flow through a late successful response. Tab-close protection now tracks confirmed upload success rather than the existence of a promise, so it remains active during upload and after failure. Cloudinary asset IDs are persisted before upload; failed compensation retains cleanup_pending metadata and counted bytes. Hourly/startup cleanup retries these assets and recovers uploading records older than ten minutes. Upload retries first clear prior assets and do not overwrite unresolved cleanup. Existing transcripts and owner permissions are preserved.

Regression tests cover late microphone permission, late authorization after cancellation, warning through pending/failed/retried uploads, metadata-save failure followed by Cloudinary deletion failure, durable asset tracking and subsequent cleanup/upload recovery. Jest now explicitly compiles tests to CommonJS so browser hook logic can run with controlled browser adapters. Backend typecheck and frontend production build pass. No real provider requests or credits were used for these fixes.

Final verification for review fixes: 158 tests passed in 16 suites; backend typecheck, frontend build and whitespace checks passed. CI installs frontend dependencies before the new browser-hook tests. The isolated preview on port 8011 has been restarted with the fixes.

## Dedicated agent pages — 24 October 2026

Agent cards, edit actions and sidebar selection now open /agents/:agentId; creation opens /agents/new. The full-page workspace retains identity, instructions, voice/model settings, tool selection and custom tool configuration, connected knowledge and publishing. Sections have refreshable query URLs, saving stays on the page, and stale saves cannot replace another agent's draft after navigation. Custom tool editing is inline; the shared voice library remains available from the roster.

A circular microphone control and the existing voice/text conversation engine are embedded alongside settings. Viewing settings does not create a conversation: Connect test prepares a session, Start conversation starts speech, and New test loads the latest saved configuration. Existing recording disclosure, capture, upload retry, history and provider limits are reused. Published versions remain separate from edits. Missing-agent and loading states are handled.

Verification: frontend production build and backend typecheck pass; 10 continuous-voice/recording lifecycle regression tests pass. Chrome checks covered agent-card navigation, unchanged save, tools, agent-scoped knowledge, inline publishing, create-page entry, direct URL refresh retaining Instructions, connect-to-cloud session readiness, and ending the idle test. No microphone was opened and no model/TTS request was made in this UI verification. Physical conversation acceptance remains the existing manual test.

## Conversation History pagination — 24 October 2026

History now requests a bounded page from the server (10 by default; UI choices 10, 25, 50). Previous/Next, page count and visible-result range are displayed. Search is debounced, searches conversation/agent IDs, names and transcript text across the workspace before pagination, and resets to page one. Workspace totals remain independent of page size and search. Invalid query limits return 400, oversized page numbers clamp to the last available page, and sorting uses an ID tie-breaker. Existing internal history consumers keep their prior interface. In-flight list/detail requests are cancelled to prevent stale results after page/search changes.

Verification: all 21 workspace integration tests pass, including page boundaries, full-text search outside page one, private totals, empty matches and invalid parameters. Backend typecheck and frontend build pass. Chrome checks verified Next, page-size selection and search reset across 33 existing conversations. No provider calls were made. The isolated 8011 preview was refreshed with the new API.

## History design refinement — 24 October 2026

Implemented compact conversation rows, clearer text contrast, pagination beside the search area, abbreviated IDs with full-ID copy controls, expandable metadata, and independently scrolling conversation and transcript panes. Existing audio playback/download/delete controls and tool/source details remain available. Browser checks confirmed next/previous paging, selection, recording controls and copy feedback; typecheck and client build pass. Spoken audio playback was not exercised in this design check.

History readability follow-up: compact heading and inline statistics reclaim vertical space; desktop panels have a 520px minimum height with page scrolling on short screens. Pagination stays below the fixed app header, and each panel retains its own scroll area. Browser verified the full audio player and multiple messages visible together; client production build passed.

History request recovery: failed list requests clear stale rows and selected details, show an explicit error/retry state, and disable paging until retry or a new query succeeds. A controlled component check verified page-2 failure and same-page retry recovery; client build passed.

## Free hosting preparation — 24 October 2026

Added a Render free-service Blueprint, same-origin studio hosting with SPA deep-link fallback, a combined frontend/backend Docker build and a MongoDB-required startup option for temporary hosting filesystems. Backend build and 5 hosting route tests pass. The Docker image was not built locally because Docker Desktop is not running. No remote service was created and no credentials uploaded; Render sign-in, repository connection and hosted acceptance remain pending. See docs/DEPLOY_RENDER.md.

## Render deployment — 24 October 2026

Live URL: https://voiceai-demo-swi9.onrender.com . Render Free Docker service srv-dbedogvb9u1s739cbutg uses the feat/voice-streaming-flow branch. Commits 46b5385, 9b123f2 and f1c332c add hosting, isolate frontend types and preserve approved live/cloud settings. MongoDB and Gemini/Deepgram/Cartesia/Cloudinary credentials were configured privately with explicit user approval. Database readiness and liveness return 200; /history and /agents/new serve the SPA; unauthenticated /api/auth/me returns 401. Hosted guest text demo responded successfully. Seven voice lifecycle tests passed after the clean-build fix, in addition to the 29 deployment regression checks. Runtime live and speech cloud were verified in Render. Real microphone capture, private Gemini inference and recording playback still require hosted account acceptance. Hosted database is voiceai_demo; local workspace data was not migrated. Select Gemini for agents whose default model is OpenAI.

## Voice latency iteration — 24 October 2026

Implemented provider end-of-speech forwarding, shorter fallback endpointing, 100ms microphone packets, server-authorized incremental speech sentences and bounded next-sentence prefetch. Removed the late interrupt-request race and scoped disconnect cancellation to its own turn. Added transient-noise suppression and distinct timeout errors. Private tester shows first-text/first-audio/completion timings from submission. Targeted regression suite: 42 tests passed; frontend/backend builds passed. This is sentence-level playback, not PCM-level streaming; no measured end-to-end latency target is claimed. See docs/VOICE_LATENCY.md.

Additional stream-parser/provider checks passed (47 targeted tests total). Two real Chrome typed-input tests reached audible playback: first-audio timings were 9781ms and 4668ms; no end-to-end latency improvement percentage is claimed. Microphone/noise acceptance remains pending. Model first-text delay was the largest measured component.
