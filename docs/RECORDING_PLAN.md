# Conversation history and recording plan

Status: proposed, not implemented. Updated 2026-10-24.

## Goal

Every supported playground or embedded-widget conversation belongs to the agent owner's workspace. Each has a unique conversation ID linked to a stable agent ID. History lists conversations; opening one loads its transcript, tools, status, timings and available audio. Knowing an ID never grants access.

## Implementation phases

1. Enable persistent history for published widget sessions. Preserve the existing session ID as the conversation ID; add deployment, version, channel and originating website metadata. Save session start, turns and end/expiry, including conversations with no completed reply. Keep widget guest access separate from owner-only history access. Do not enable cloud speech merely because history saving is enabled; keep speech permissions explicit.
2. Capture both microphone audio and actual agent playback through a browser audio graph, encode using a supported MediaRecorder format, and upload numbered chunks. Capture interruptions as heard, rather than synthesizing a recording from the final transcript. Handle unsupported browsers explicitly. Browser capture covers our widget and playground; future telephone channels need a separate server/carrier recording adapter.
3. Use authenticated or narrowly scoped uploads, with byte/duration/workspace quotas, validated content and idempotent chunk numbering. Keep audio private outside public static directories. Record pending, uploading, ready, failed and partial states. Closing a tab can prevent final upload; do not label incomplete audio complete.
4. Add owner-only History playback, conversation/agent IDs, agent filters, duration, download and delete. Require workspace authorization for every media request; cloud media uses short-lived signed URLs. Delete audio with its record and apply configurable retention.
5. Verify widget-to-owner history, workspace isolation, interrupted playback, chunk retries, session expiry, deletion and quota behavior. No extra AI requests are needed just to record audio.

## Storage choice

Start with a private directory on the existing server, using a persistent disk/volume. This requires no new storage vendor or key and no additional storage service bill while using existing disk capacity. Hosting/disk costs still apply; ephemeral hosting disks are unsuitable. Add configurable retention (initially 30 days), a storage cap and refusal of new recording uploads when full; preserve transcripts and report unavailable audio clearly.

Implement a storage adapter so a private Cloudflare R2 bucket can be enabled later without changing conversation IDs. R2 Standard currently includes 10 GB-month storage, 1 million Class A and 10 million Class B operations monthly, with free direct egress. Usage beyond allowances is billable; do not promise unlimited free storage. Supabase Free offers 1 GB file storage with separate bandwidth limits.

At 32–64 kbps, a compressed recording is roughly 0.24–0.48 MB/minute before container overhead. Actual browser settings and recordings must be measured before setting quotas. Enforce limits in the application; free-tier limits are not an automatic spending cap.

## Disclosure and configuration

No separate visitor recording toggle is required by this product plan. Present the configured AI/recording notice before starting; support additional consent where required. Save notice version and acknowledgement metadata. Microphone permission alone is not recording/storage disclosure. This plan does not enable undisclosed recording.

## Current limitations

Signed-in transcripts exist. Published widget sessions currently omit history saving. Browser conversation audio is not currently stored. Existing provider charges for speech and AI remain independent of recording storage. No cloud bucket has been provisioned by this plan.

## Sources checked

- https://developers.cloudflare.com/r2/pricing/
- https://supabase.com/pricing
- https://elevenlabs.io/docs/api-reference/conversations/get
- https://www.retellai.com/blog/voice-ai-data-map
