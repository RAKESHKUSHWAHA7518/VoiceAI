# Conversation history and recording plan

Status: Demo Cloudinary integration and recording workflow implemented; physical two-speaker microphone acceptance remains to be checked. Updated 2026-10-24.

## Selected demo provider: Cloudinary

The demo will use Cloudinary for image and audio assets. Server-only placeholders are available in `.env` and `.env.example`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Existing values must be preserved. Credentials do not enable recording automatically.

Delivery phases:

1. Configuration (complete): add blank credential settings and load them server-side. Fill the settings from the Cloudinary dashboard and restart the backend. Actual connectivity remains unverified until credentials are supplied.
2. Storage integration: implement signed server uploads and deletion; validate image/audio formats, sizes and ownership. Use authenticated delivery for conversation audio. Audio uploads use resource type `video`, image uploads use `image`. Verify an upload/playback/delete round trip with a small sample. No unsigned public upload preset or exposed API secret.
3. Centralized history: persist published-widget sessions in the owner's workspace, linked to agent, conversation, deployment and version IDs. Preserve current guest isolation and explicit speech permissions.
4. Recording: mix microphone and actual agent playback, upload recoverable chunks, and track pending/partial/failed/ready states. Store Cloudinary asset identifiers and media metadata against the conversation; keep transcripts in our existing database. Show the configured disclosure before recording.
5. History playback: add owner-authorized player, IDs, duration, download and deletion. Validate private delivery on the chosen Cloudinary account rather than assuming every delivery feature is included.
6. Demo verification: test two websites, account isolation, interrupted speech, failed uploads and deletion. Add conservative app quotas and retention cleanup to stay within the shared free allowance. Until cleanup and quotas exist, do not claim automatic cost protection.

Cloudinary Free currently offers 25 shared credits across storage, delivery bandwidth and processing, not independent allowances for each. Check account usage before the demo. Images share the same allowance as audio. Provider documentation: https://cloudinary.com/documentation/billing_and_plans and https://cloudinary.com/documentation/upload_parameters .

## Goal

Every supported playground or embedded-widget conversation belongs to the agent owner's workspace. Each has a unique conversation ID linked to a stable agent ID. History lists conversations; opening one loads its transcript, tools, status, timings and available audio. Knowing an ID never grants access.

## Implementation phases

1. Enable persistent history for published widget sessions. Preserve the existing session ID as the conversation ID; add deployment, version, channel and originating website metadata. Save session start, turns and end/expiry, including conversations with no completed reply. Keep widget guest access separate from owner-only history access. Do not enable cloud speech merely because history saving is enabled; keep speech permissions explicit.
2. Capture both microphone audio and actual agent playback through a browser audio graph, encode using a supported MediaRecorder format, and upload numbered chunks. Capture interruptions as heard, rather than synthesizing a recording from the final transcript. Handle unsupported browsers explicitly. Browser capture covers our widget and playground; future telephone channels need a separate server/carrier recording adapter.
3. Use authenticated or narrowly scoped uploads, with byte/duration/workspace quotas, validated content and idempotent chunk numbering. Keep audio private outside public static directories. Record pending, uploading, ready, failed and partial states. Closing a tab can prevent final upload; do not label incomplete audio complete.
4. Add owner-only History playback, conversation/agent IDs, agent filters, duration, download and delete. Require workspace authorization for every media request; cloud media uses short-lived signed URLs. Delete audio with its record and apply configurable retention.
5. Verify widget-to-owner history, workspace isolation, interrupted playback, chunk retries, session expiry, deletion and quota behavior. No extra AI requests are needed just to record audio.

## Storage choice

Cloudinary is now the selected demo provider. A private directory on an existing persistent server disk remains an alternative. Hosting/disk costs still apply; ephemeral hosting disks are unsuitable. Add configurable retention (initially 30 days), a storage cap and refusal of new recording uploads when full; preserve transcripts and report unavailable audio clearly.

Implement a storage adapter so a private Cloudflare R2 bucket can be enabled later without changing conversation IDs. R2 Standard currently includes 10 GB-month storage, 1 million Class A and 10 million Class B operations monthly, with free direct egress. Usage beyond allowances is billable; do not promise unlimited free storage. Supabase Free offers 1 GB file storage with separate bandwidth limits.

At 32–64 kbps, a compressed recording is roughly 0.24–0.48 MB/minute before container overhead. Actual browser settings and recordings must be measured before setting quotas. Enforce limits in the application; free-tier limits are not an automatic spending cap.

## Disclosure and configuration

No separate visitor recording toggle is required by this product plan. Present the configured AI/recording notice before starting; support additional consent where required. Save notice version and acknowledgement metadata. Microphone permission alone is not recording/storage disclosure. This plan does not enable undisclosed recording.

## Current limitations

Signed-in and published-widget transcripts now persist. Cloud-voice sessions support mixed microphone and actual Cartesia playback recording. Browser-native synthesized speech is not recordable through this audio graph; those sessions remain transcript-only. Existing provider charges for speech and AI remain independent of recording storage. Cloudinary credentials were verified against the user account. No R2 bucket was provisioned.

## Sources checked

- https://developers.cloudflare.com/r2/pricing/
- https://supabase.com/pricing
- https://elevenlabs.io/docs/api-reference/conversations/get
- https://www.retellai.com/blog/voice-ai-data-map

## Implemented demo workflow — 24 October 2026

- Cloudinary official SDK, server-only credentials, authenticated uploads and backend-proxied private playback. Verified a one-second synthetic WAV upload, private download, unsigned delivery denial, authenticated image upload and deletion of both temporary assets. No model or TTS calls were used in that verification. Image storage has a tested backend adapter; an image upload/editor UI is not added by this recording task.
- Recording endpoints require a saved session and recording-v1 notice acknowledgement before accepting audio. Public widgets use their existing scoped guest token to upload; only the owner account can retrieve audio. No guest history endpoint exists.
- Conversation start (including no-turn sessions), deployment/version/origin/channel, completed turns and normal close/expiry are saved. Public demo widgets remain browser-only and never enable paid speech just because history is saved. Live public widgets may use Cartesia only when public live access is explicitly enabled. Browser speech recognition remains the input for widgets; private cloud sessions use Deepgram. Existing public tools remain disabled.
- Browser audio graph mixes microphone input and actual Cartesia HTML audio playback, so cancelled playback ends where it was heard. Starting the mic acknowledges the visible notice. Pausing pauses capture, and stopping ends microphone tracks. End conversation uploads the file; failed uploads retain the local blob for retry while the page stays open.
- Demo limits: five minutes, 12 MB per upload, conservative 100 MB per workspace / 500 MB tracked app storage, three concurrent uploads. These caps do not measure total Cloudinary account credits or bandwidth. Existing external account assets also consume credits.
- Audio is removed after 30 days through hourly cleanup while the backend runs and cleanup before new recording starts; expired playback is denied immediately. Failed Cloudinary deletion is retried by later cleanup, not silently forgotten.
- History displays IDs, channel, origin, transcript, audio status, player, download and audio deletion. Deleting audio preserves its transcript.

Known limits: Audio chunks are buffered in browser memory and finalized into one upload at normal end; recoverable progressive uploads are a future phase, not complete. Browser/tab crashes or forced navigation can lose unsaved audio. Normal modal close waits for saving; the tab warns about unsaved recording. A pending status after browser loss is not a complete recording. Telephone recording needs a separate adapter. Actual microphone-to-agent two-sided recording and interruption acceptance need a human speaking test.

Review follow-up: startup cancellation is explicit and pending microphone resources are stopped even if permission resolves late. An upload promise is separate from confirmed success for tab-close warnings. Asset identifiers are persisted before Cloudinary upload; cleanup_pending assets remain tracked and count toward app storage until deletion succeeds. Hourly cleanup retries failed deletion; interrupted uploading records become eligible for recovery after ten minutes. Regression coverage uses mocked browser/provider responses without opening the microphone or spending provider credits.
