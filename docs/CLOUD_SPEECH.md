# Deepgram and Cartesia voice testing

Updated 24 October 2026. The user explicitly replaced the earlier browser-only restriction with authorization to stream live microphone audio to Deepgram and use existing provider credits. No microphone recording is stored by this app.

## Active path

Private Talk to agent -> microphone MediaRecorder Opus chunks -> authenticated same-origin websocket proxy -> Deepgram Nova 3 -> finalized transcript -> existing conversation service (knowledge, model and assigned tools) -> Cartesia Sonic 3.6 WAV -> browser audio playback.

The AI model runtime and speech runtime are independent. The isolated preview uses real paid speech credits with the free demo response engine, not a paid LLM. Gemini live answers still require its key and live model configuration. Guest demos and public widgets retain browser speech and do not gain access to the owner's speech credits.

Set VOICEAI_SPEECH_MODE=cloud with DEEPGRAM_API_KEY and CARTESIA_API_KEY in the backend environment. The user's local .env has cloud speech enabled. The isolated preview is started with .qa/start-cloud.cjs, which loads only these speech keys and keeps language-model keys unset. Restart the backend after changing environment settings. Use a Cartesia voice in the agent's Voice & language step; other provider voice IDs are not automatically converted.

## Controls and limits

- Start conversation requests microphone permission and streams audio only after a user action. Pause, End, dialog close and unmount stop microphone tracks, close sockets, cancel audio generation and release audio object URLs.
- The server issues an opaque one-use ticket valid for 30 seconds. The websocket also checks the signed-in account, conversation ownership and request origin. No provider key is sent to the browser.
- One microphone stream per workspace, five minutes per stream, 12 starts per hour and a 12 MB stream limit. Keepalives handle normal silence. These are in-memory showcase safeguards, not durable billing caps.
- Cartesia accepts only greetings or assistant replies already in the selected private conversation, at most 2000 characters per request and 6000 characters per workspace per hour. One in-flight speech request per workspace. Limits reset with server restart.
- No external audio service is silently selected after a failure. Clear errors require resume/retry. Browser speech can be restored by setting VOICEAI_SPEECH_MODE=browser and restarting.
- Text responses still stream. Cartesia output currently plays after a complete reply's WAV has arrived; it is not yet sentence-by-sentence streaming speech synthesis. Measure acoustic latency separately from text response time.
- Headphones and browser echo cancellation help interruption handling; real acoustic barge-in remains unverified.

## Evidence

145 tests pass in 13 suites; backend typecheck and frontend build pass. Tests cover speech ownership, anonymous rejection, permitted reply text, no raw provider key in ticket responses and existing continuous conversation cleanup.

Live validation used short synthetic samples only: Cartesia returned a valid WAV, Deepgram's prerecorded endpoint recognized it, and a direct live Deepgram websocket produced finalized expected speech. The app's authenticated Cartesia endpoint returned WAV and its microphone proxy connected to Deepgram and relayed transcript events. A synthetic proxy smoke test initially ended at the first final segment, rather than the entire phrase; further whole-phrase acceptance is not claimed. Temporary-token creation was rejected by Deepgram (403), so the app uses the server proxy and never exposes the long-lived key.

In-app browser microphone startup returned Permission denied. A person must allow microphone access in a supported browser and speak to validate the physical microphone-to-reply conversation. Browser testing showed the active Deepgram microphone / Cartesia voice labels, credit/data disclosure and an appropriate microphone error state. No real human microphone transcription or audible quality certification is claimed.

## Manual acceptance

1. Open http://127.0.0.1:8011/agents in Chrome or Edge and sign in.
2. Choose Talk to agent. Confirm Deepgram microphone / Cartesia voice in the header.
3. Click Start conversation and allow microphone access. Wear headphones.
4. Say hello, then ask about a connected policy. Check finalized words, spoken reply and saved transcript.
5. Interrupt a reply, then Pause and End. Confirm the browser microphone indicator stops. Test network loss and permission denial.
6. For genuine model reasoning and natural tool selection, configure Gemini separately; demo answers remain labeled as such.

References: [Deepgram live API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [Cartesia TTS bytes](https://docs.cartesia.ai/api-reference/tts/bytes), checked 24 October 2026.
