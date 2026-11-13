# Voice quality checkpoint — 26 October 2026

These changes are local. Deployment needs the owner's permission.

## Implemented

- Cartesia audio is relayed incrementally from `/tts/bytes` as signed 16-bit little-endian mono PCM at 24 kHz. Browser `AudioContext` plays small buffers without waiting for a whole sentence WAV. This uses streaming HTTP responses; it does not require a new WebSocket or LiveKit service.
- Existing sentence authorization, workspace ownership, public session tokens, character budgets, response size bounds, deadlines and disconnect cancellation still apply. Reverse proxy buffering and compression are disabled for these responses.
- Browser scheduling is bounded to roughly two seconds of upcoming audio. Cancellation stops scheduled sources, the provider request and the recording output. WAV playback remains the compatibility path where AudioContext is unavailable.
- The PCM stream feeds the existing recording mixer alongside microphone capture. Recording remains opt-in through the existing microphone flow and notice. Typed tests without recording do not create an audio recording.
- Headphone-mode interruption filtering accepts corrections that share words with the agent. It accepts finalized short controls/answers, while full repeated phrases remain filtered as possible echo. Speaker mode retains its explicit echo-safe behavior and manual Interrupt control; this is not an acoustic echo classifier or full speaker-mode barge-in.
- Knowledge tokenization preserves Unicode letters, combining marks and numbers, including Hindi. Previously loaded chunk vectors refresh once on first search, so existing documents need no re-upload. This remains lexical retrieval; Hindi queries are not automatically translated into English documents.
- Completed turns save browser first-text/first-audio timing privately, once per turn. Where Deepgram word-end timing is available, they also save estimated transcript wait and speech-to-audio time. History displays these under Response timing, alongside retrieval and model-first-text timing. PCM timing uses the scheduled browser audio clock; it is not a microphone loopback measurement of physical speaker output. Typed tests omit speech-end timing.
- The live weather tool passes cancellation into its HTTP calls, has a shared five-second deadline, marks live responses explicitly and fails honestly if lookup is unavailable. It no longer returns invented fallback temperatures. Booking, transfer and fixture tools retain their simulation labels; no external calendar integration was added in this checkpoint.

## Verification

Backend and frontend production builds passed. The final focused integration run passed 44 tests across workspace isolation, cloud speech, incremental delivery before stream completion, recording authorization, persisted timing, cancellation, Hindi legacy indexing, echo/correction behavior, PCM decoding and weather failures. A further focused run passed 31 checks including provider parsing and end-call behavior; five overlap with the integration run, giving 70 distinct passing checks across these runs.

Eight synthetic Gemini calls compared two models already listed in the app, with one repeat per prompt/profile. Each cell has only two successful samples:

| Model | Baseline first-text p50 | Fast-profile first-text p50 |
| --- | --- | --- |
| gemini-3.5-flash-lite | 1163 ms | 1842 ms |
| gemini-3.1-flash-lite | 1046 ms | 1984 ms |

All eight calls succeeded. This small run does not establish that one model/profile is consistently faster. No saved agent model was changed. Report: ignored `.qa/model-latency.json`; prompts, responses and timing remain local. These calls exclude tools, knowledge retrieval, microphone recognition and audio playback, and cannot establish a 3–4 second voice target.

## Chrome acceptance

A real saved-agent test in Chrome used Gemini and streamed Cartesia audio. First text was 2030 ms, first audio 3889 ms and answer completion 2144 ms, all measured from typed turn submission. History showed the same private timing after ending the conversation, with server retrieval 5 ms and model first text 2000 ms. This single sample meets the 3–4 second target only for typed input; it excludes speech recognition and does not establish a percentile or guaranteed improvement. Audio was not recorded because microphone recording was not started.

## Acceptance still requiring a person speaking

Use Chrome, open an agent, Connect test, then Start conversation. Compare headphones with speaker mode. Ask a knowledge question, interrupt with a correction, ask live weather, then say goodbye. In History check the transcript, both voices in the recording and Response timing. Repeat across warm conversations and report cold startup separately. Natural microphone quality, speaker-mode behavior and end-to-end latency need this acceptance check before claiming production voice quality.
