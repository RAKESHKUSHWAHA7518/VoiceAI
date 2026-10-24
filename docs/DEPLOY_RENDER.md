# Free demo deployment

The repository includes `render.yaml` for one free Docker web service. The Docker image builds both apps; Express serves the studio, API, streaming responses and speech WebSocket at the same HTTPS origin. Deep links such as `/history` work after refresh. MongoDB is required because Render free local storage is temporary. The supplied Blueprint starts in demo/browser-speech mode and leaves paid public inference disabled.

## Publish

1. Push the reviewed application changes, Dockerfile and render.yaml to your GitHub repository. Do not push `.env`, runtime data or recordings.
2. Sign in to Render, choose New → Blueprint, and connect the VoiceAI repository and intended branch. Review the service plan: Free.
3. Provide `MONGODB_URI` privately in Render. Prefer a separate Atlas demo database and a database user restricted to it. The Blueprint uses `MONGODB_DB_NAME=voiceai_demo`; existing local accounts and agents are not copied into this database automatically. Configure Atlas network access for the hosting service's outbound addresses.
4. Apply the Blueprint. Wait for `/health/live` to pass. Open the generated HTTPS URL, create a demo account, create an agent and test history after refreshing.
5. To enable the already implemented live pipeline, privately add `GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in Render. Set `VOICEAI_RUNTIME_MODE=live` and `VOICEAI_SPEECH_MODE=cloud`. Choose Gemini on the saved agent. Keep `VOICEAI_PUBLIC_LIVE=false` until intentionally enabling paid visitor usage. Provider calls use your existing credits.
6. Verify browser microphone permission, two-way speech, tool execution, knowledge retrieval, private recording playback and history after restarting. This acceptance check requires your microphone and provider credits.

Render free services sleep after 15 idle minutes and can take about a minute to wake up. Warm the service before a presentation. Treat this as demo hosting, not an always-on production service. Cloudinary holds uploaded audio; MongoDB holds accounts, saved configurations, transcripts and recording metadata. Some showcase simulations and usage counters still reset with the process. Original uploaded knowledge files may depend on local storage; verify the document workflow after restart before presenting it.

## Validation and limits

Deployment is not complete until the hosted HTTPS checks pass. Local compilation and route tests do not prove a remote Docker build or provider connectivity. No provider credentials belong in the client build, Git, Blueprint or screenshots. Docker Desktop must be running to test the image locally.

References: https://render.com/docs/free and https://render.com/docs/blueprint-spec.
