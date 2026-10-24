# Voice flow latency checkpoint

Implemented 24 October 2026.

The browser microphone streams 100ms encoded chunks to Deepgram through the authenticated backend. Deepgram finalized transcript segments accumulate until speech_final ends the utterance. This endpoint flushes finalized text immediately; a 600ms fallback covers missing endpoint signals. Interim text is never submitted as a completed turn.

The model response streams as text and server-registered speech sentences. The first complete sentence can be spoken before the full reply or its database write completes. Sentences are bounded to roughly 240 characters. Speech requests reference the owning session, turn ID and segment index; the backend resolves the text and refuses foreign, unregistered or cancelled segments. Existing completed-reply speech remains compatible.

Cartesia synthesis downloads one short sentence as WAV and plays it, while preparing one upcoming sentence. This is sentence pipelining, not PCM-level audio streaming. Every actual audio element still attaches to the existing recording mixer. Cancellation aborts current and prefetched requests, drops queued speech and ignores stale playback events.

A response disconnection aborts its own controller. Starting a new browser turn no longer fires a separate unscoped interrupt request, avoiding late cancellation of a replacement response. Model timeouts are reported separately from caller interruption. In headphones mode, transient interim text and filler words do not cut off playback: sustained multiword recognition or a finalized phrase/stop command is required. Speaker mode still suppresses recognized echo during playback; full duplex speaker barge-in with acoustic VAD remains future work.

The private tester displays first-text, first-audio (browser playing event), and completed-answer timings, measured from turn submission. They exclude speech recognition and are not a mouth-to-ear latency benchmark. No latency percentile or production SLA is claimed. Compare warm runs with the same prompt, model, network and device; report p50 and p95 only after collecting a representative sample.

Validation covers endpoint flush without interim submission, false interruption suppression, queue cancellation, next-sentence prefetch, stale audio cancellation, streaming speech authorization before completion, recordings, account isolation and hosted routes. Real microphone/end-to-end acceptance is still required for noise, accents, pauses and device output. Render Free cold starts remain separate from warm-turn latency.

Next phase: PCM/audio-byte streaming, acoustic VAD/echo-aware interruption, durable per-turn timing summaries in History and a repeatable browser benchmark. Keep current provider credits and single-instance deployment constraints visible in any portfolio claims.

## Observed live samples

Two sequential local Chrome tests used the existing Maya Gemini Flash-Lite configuration and real Cartesia playback, with typed input and no microphone recording. Sample 1: first text 7973ms, first audio 9781ms, complete answer 7997ms. Sample 2: first text 4000ms, first audio 4668ms, complete answer 4159ms. These are observations, not before/after improvement percentages or latency percentiles. The model time-to-first-text dominates both samples. Short answers can finish generation before their first synthesized sentence is ready. The 1–1.5s objective has not been achieved; compare provider/model behavior and pursue audio-byte streaming next. Tests used existing provider credits and saved ordinary test transcripts in the local workspace.
