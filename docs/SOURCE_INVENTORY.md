
History/speech/publishing correction additions: shared/speechSegments.ts, server/tests/conversation_persistence.test.ts, server/tests/speech_segments.test.ts.

Cloudinary recording additions: server/src/services/cloudinary_media.ts (authenticated media adapter), server/src/services/recordings.ts (private metadata/retention), server/src/routes/recordings.ts (bounded upload and owner playback/delete), client/src/hooks/useConversationRecording.ts (mixed browser capture and upload retry). Widget history is persisted via server/src/routes/public.ts. See docs/RECORDING_PLAN.md for demo limitations.

Dedicated agent UI: client/src/components/agents/AgentsTab.tsx now serves routed creation/editing at /agents/new and /agents/:agentId. Knowledge and deployment settings are embedded without main editor/publish overlays. LiveVoiceCallModal supports an embedded panel with explicit connection and fresh-test controls; the guest authentication preview keeps its existing modal flow. App and sidebar navigation route to the agent workspace. No backend/provider protocol changes were needed for the page layout.
