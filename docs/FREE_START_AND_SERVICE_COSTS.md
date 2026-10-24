# VoiceAI free start and service costs

Checked 24 October 2026. No purchase is required to build locally. Free allowances are suitable for learning and a small demonstration; production usage needs a separate operating budget.

| Need | Start without payment | When payment becomes relevant |
| --- | --- | --- |
| Studio, accounts, agent builder and widget development | Run this project on the existing computer | Public hosting, maintenance and increased usage |
| Database | Local JSON for development or MongoDB Atlas M0 | Capacity, availability and operational requirements beyond M0 |
| Speech recognition | Deepgram introductory credit, subject to account eligibility | After credits or the account allowance are exhausted |
| Language model | Groq free plan with model-specific rate limits | More traffic or a different paid model |
| Generated voice | Cartesia Free with 20K credits per month | Larger usage and commercial licensing; Pro currently starts at USD 5 per month |
| Realtime transport and hosted voice workers | LiveKit Build at USD 0 per month with included allowances | Higher usage and paid-plan capabilities; inference is metered separately from session minutes |
| Browser microphone and playback | Existing browser and microphone | No separate telephone number required |
| Telephone calls | Optional restricted carrier trial, or eligible included LiveKit US telephony allowance | Carrier numbers, destination-dependent minutes and public production calling |
| Domain | Localhost during development | Optional branded domain when the public demo is ready |

Recommended first step: use the existing computer and database configuration; build account isolation, saved agents and browser testing before provisioning phone service. Existing Deepgram, Cartesia and MongoDB environment values are present, but their validity, plan and remaining balances have not been verified. LiveKit and Groq are optional account setups for later integration, not prerequisites for the current development work.

Create a Groq free account only if choosing its LLM route. The current playground still calls its existing model path; a free account alone does not change that implementation. Create a LiveKit Build account when the media integration begins. Keep keys on the server in environment configuration, never in chat messages, source control or a widget snippet.

Do not subscribe to several competing voice platforms at once. Choose one transport, one STT provider, one LLM and one TTS provider. Keep paid calling disabled until browser conversation and spending limits work. No service was purchased, provisioned or charged during this development step.

LiveKit's pricing currently includes 1000 hosted agent session minutes and USD 2.50 inference credits on Build; these are separate allowances. The displayed free US number and inbound allowance are US-specific and should not be assumed to provide an Indian number. Twilio trials have verified-number and other restrictions. Check account eligibility and geography before relying on either for a demonstration.

First implementation completed: agent records now use the existing MongoDB persistence layer when configured and a local agents JSON file otherwise. Fresh installations show two starter agents. Language settings are saved, new agents receive no tools by default, invalid configurations are rejected, and failed saves restore the previous in-memory state. An existing empty agent list stays empty across reloads. This remains a single-process foundation; account ownership and published versions are still pending.

Verification: backend typecheck passed and 100 tests passed across five suites. New tests exercise reload, deletion without reseeding, invalid configuration and recovery from storage failure using isolated file mocks. Live Atlas and paid-provider integrations were not exercised.

Sources checked:

- MongoDB free cluster: https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/
- Deepgram introductory credits: https://deepgram.com/pricing
- Groq free-plan limits: https://console.groq.com/docs/rate-limits
- Cartesia free and paid plans: https://www.cartesia.ai/pricing
- LiveKit allowances and pricing: https://livekit.com/pricing
- Twilio trial restrictions: https://help.twilio.com/hc/en-us/articles/360036052753-Twilio-Free-Trial-Limitations
