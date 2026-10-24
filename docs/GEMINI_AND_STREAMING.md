# Gemini and streaming playground

Updated 24 October 2026.

## What is implemented

- Text arrives progressively through the existing private conversation stream. Tool result events appear as they arrive. Stop aborts the request and closes its session; the next message starts a new session. New conversation clears this agent's local test list, preserves stored history and opens fresh context on the next message.
- Agent edits and switching agents close the previous session. Each displayed result belongs to its initiating agent; old requests cannot append output to a replacement request. Leaving the page ends the playground session.
- Gemini is routed through Google's documented OpenAI-compatible endpoint using a server-only key. Gemini's opaque tool-call metadata is preserved in model follow-ups. Arguments are accumulated until the provider finishes; incomplete JSON is rejected rather than repaired into executable arguments.
- The same bounded, assignment-checked mock/simulation tool runner supports Gemini, OpenAI and Groq conversations. Public widgets keep tools disabled. External bookings/transfers/webhooks are not enabled.
- Knowledge reference titles appear under answers. They identify retrieved context, not claim-level verified citations.
- Private history records the saved agent configuration, successful messages and failed/interrupted turn outcomes. Partial failed replies do not enter follow-up model context. Previous history remains readable. Failed-turn tool events are retained in turn_outcomes in the history API, while the current transcript UI emphasizes failed/interrupted text and completed tool events.
- Provider key rejection, quota/rate limits and unavailable models have actionable messages without exposing provider responses or secrets.

## Enable genuine Gemini answers

1. Put GEMINI_API_KEY in the backend's local environment. Never put it in frontend configuration, screenshots or chat. Existing accounts may have quota or billing requirements; check the chosen model's access.
2. Set VOICEAI_RUNTIME_MODE=live on the backend and restart it. This is a server-wide runtime setting, not a browser preference. The isolated QA preview intentionally stays in demo mode with provider keys unset.
3. Edit an agent, open Voice & language, select Google Gemini Flash, and set a model ID available to your account. The saved internal model name has the prefix gemini/. The default example follows the current Google documentation; model availability must be checked against your account.
4. Assign check_booking in Tools and save. In Playground choose New conversation. Ask naturally: Check booking DEMO-123. In live mode the model should call the tool, see its labeled simulation result and explain it accurately. A tool is not guaranteed to be called by every prompt; verify the tool event rather than assuming it ran.
5. Ask a question from a connected policy. Confirm arriving text, retrieved reference titles, follow-up context and the matching history configuration.
6. Test Stop during a long response, then New conversation. Confirm no stale text appears and an interrupted outcome is retained. Test a missing key, unavailable model, denied tool and provider quota failure.

In free demo mode, /tool check_booking {"booking_id":"DEMO-123"} deterministically tests the assigned runner. A demo response is not real model reasoning or evidence of natural language tool choice.

## Verification and limits

All 144 tests in 13 suites pass. Tests cover fragmented UTF-8 text, callbacks before completion, incomplete stream rejection, fragmented provider tool calls, metadata preservation, Gemini key/endpoint routing, tool feedback, isolation, configuration snapshots and failed-turn history. Provider behavior is exercised with local fixtures/mocks, not a paid request. Backend typecheck and frontend build pass.

Browser checks confirmed knowledge references, tool results, New conversation reset, saved configuration history and the editable Gemini selector. The demo is fast, so it does not establish observable long-running live-token cadence or Stop behavior against a real provider. Real Gemini model quality, natural language tool choice, audio latency, physical microphone recognition and acoustic interruption remain acceptance gates. No cloud audio fallback or LiveKit was added.

[Google compatibility documentation](https://ai.google.dev/gemini-api/docs/openai), checked 24 October 2026.
