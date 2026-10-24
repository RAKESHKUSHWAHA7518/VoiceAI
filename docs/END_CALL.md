# Automatic browser conversation ending

Local implementation, 24 October 2026. Not pushed or deployed; deployment requires the user's permission.

The built-in end_call control is available to all browser conversations, including the private tester and embedded website widget. Explicit caller requests such as "I'm done", "Please end the call", "Goodbye", and "कॉल बंद कर दो" produce a short goodbye, a completed end_call tool event and an end_call flag in the persisted turn completion. This path does not require model inference. The model cannot independently close a session without validated caller intent.

Matching is intentionally conservative. Task completion ("I am done with the payment"), negation ("Don't end the call"), quotations, thanks alone and requests followed by another question stay open. Unrecognized or ambiguous phrases continue the ordinary conversation. This is a bounded phrase matcher, not general semantic intent classification.

The client waits for both successful turn completion and successful goodbye playback, regardless of their arrival order. It then stops recognition and pending work, awaits the existing recording upload, and ends the server session. If saving fails, an explicit retry message keeps the session available. An interruption resets the pending automatic end. Browser-only speech and cloud sentence playback share the completion gate. Widgets with read-aloud disabled finish after the persisted text reply. A new tester conversation can be started; website visitors can close and reopen the widget for a new session.

Transcript and end_call tool activity are saved under the existing conversation ID. Existing recording permissions, ownership, limits and retention are unchanged. This controls browser sessions; it does not implement a carrier/PSTN hang-up operation.

Validation: 65 targeted checks passed across intent matching, playback order/cancellation, streaming, history, accounts and recording lifecycle. Frontend/backend builds passed. Chrome local typed-input test "Please end the call" played a real Cartesia goodbye and reached Conversation ended automatically. First audio was 1017ms from turn submission for this deterministic goodbye; this does not represent general model latency. Microphone-based ending and a real two-sided recording require user acceptance. No remote deployment was made.
