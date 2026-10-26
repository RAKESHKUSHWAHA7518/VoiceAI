# Fast voice profile and model comparison

Local development only. No push or deployment is authorized for this work.

The fast profile keeps at most 12 recent history messages (six complete caller/assistant exchanges) and 12,000 JavaScript string characters of previous dialogue. It never truncates inside an exchange, changes stored transcripts, removes agent instructions, filters required tool definitions or splices booking identifiers. If the newest exchange cannot fit, it sends no prior dialogue rather than substituting stale older context. A system instruction tells the model to ask for missing facts when context was omitted. Current caller input, instructions, tool-round messages and knowledge are additional to this history budget; this is not a total token cap.

Ordinary spoken replies are requested in one or two short sentences, with more detail allowed for accuracy, explicit requests and necessary warnings. The output token ceiling stays unchanged to avoid truncating answers or tool arguments. Set `VOICEAI_FAST_VOICE=false` to compare with the prior unbounded recent-history request. Completion metrics include context_messages, context_chars and context_trimmed for previous dialogue only. These fields are not token counts or latency claims.

## Benchmark

`npm run benchmark:models` is offline by default. It does not load credentials or send provider requests until explicitly invoked with `--live`.

After `npm run build`, use PowerShell to select models enabled for your existing accounts:

```powershell
$env:BENCHMARK_MODELS='gemini/<enabled-model-id>'
$env:BENCHMARK_REPEATS='2'
npm run benchmark:models -- --live
```

Replace the placeholder; do not put API keys into the command. Server keys are read privately from .env at live execution. Supports gemini/, groq/ and openai/ IDs, up to three models and three repeats. Default two-repeat run uses eight requests per model; maximum run uses 36 requests across three models. Calls are sequential, use synthetic questions, have 30-second deadlines, and do not execute tools. They use provider credits when --live is enabled.

The report is written to ignored `.qa/model-latency.json`: model/profile, request timings, answer text, context counts and bounded error classifications. Profiles use the same model and synthetic prompts, with alternating execution order. The p50 is reported; p95 is withheld below 20 successful samples. Inspect answers manually for accuracy, refusal to invent refund status and brevity. This small benchmark cannot establish a production SLA, tool correctness, microphone latency or audible latency. It also compares a package of context/style changes, not a single isolated optimization.

No live benchmark is run as part of building this feature. Reducing history size may have a modest effect; model serving delay can still dominate. Next steps are a controlled provider comparison, hosted microphone measurements and audio-byte playback streaming. Existing sentence playback, end-call handling and recording remain in place.
