from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field

import websockets

from server.app.config import settings


@dataclass(slots=True)
class TranscriptSegment:
    text: str
    is_final: bool
    confidence: float
    start: float
    end: float
    words: list[dict] = field(default_factory=list)


class DeepgramStreamingASR:
    """Streaming ASR using Deepgram Nova-2 via direct WebSocket."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "nova-2",
        language: str = "en",
        sample_rate: int = 16000,
        interim_results: bool = True,
        punctuate: bool = True,
        smart_format: bool = True,
    ):
        self.api_key = api_key or settings.deepgram_api_key
        if not self.api_key:
            raise ValueError("Deepgram API key required")

        self.model = model
        self.language = language
        self.sample_rate = sample_rate
        self.interim_results = interim_results
        self.punctuate = punctuate
        self.smart_format = smart_format

        self.ws: websockets.WebSocketClientProtocol | None = None
        self._transcript_queue: asyncio.Queue[TranscriptSegment] = asyncio.Queue()
        self._running = False
        self._receive_task: asyncio.Task | None = None

    async def connect(self) -> None:
        """Establish WebSocket connection to Deepgram."""
        url = "wss://api.deepgram.com/v1/listen"
        params = {
            "model": self.model,
            "language": self.language,
            "sample_rate": self.sample_rate,
            "encoding": "linear16",
            "channels": 1,
            "interim_results": str(self.interim_results).lower(),
            "punctuate": str(self.punctuate).lower(),
            "smart_format": str(self.smart_format).lower(),
            "vad_events": "true",
            "endpointing": "300",  # ms
        }
        param_str = "&".join(f"{k}={v}" for k, v in params.items())
        full_url = f"{url}?{param_str}"

        self.ws = await websockets.connect(
            full_url,
            additional_headers={"Authorization": f"Token {self.api_key}"},
        )
        self._running = True
        self._receive_task = asyncio.create_task(self._receive_loop())

    async def _receive_loop(self) -> None:
        """Receive and parse messages from Deepgram."""
        try:
            async for message in self.ws:
                if isinstance(message, bytes):
                    continue  # Binary audio echo
                data = json.loads(message)

                if data.get("type") == "Results":
                    channel = data.get("channel", {})
                    alternatives = channel.get("alternatives", [])
                    if not alternatives:
                        continue
                    alt = alternatives[0]
                    transcript = alt.get("transcript", "")
                    if not transcript:
                        continue

                    is_final = data.get("is_final", False)
                    confidence = alt.get("confidence", 0.0)
                    words = alt.get("words", [])

                    segment = TranscriptSegment(
                        text=transcript,
                        is_final=is_final,
                        confidence=confidence,
                        start=words[0]["start"] if words else 0.0,
                        end=words[-1]["end"] if words else 0.0,
                        words=words,
                    )
                    try:
                        self._transcript_queue.put_nowait(segment)
                    except asyncio.QueueFull:
                        pass

                elif data.get("type") == "SpeechStarted" or data.get("type") == "UtteranceEnd":
                    pass
                elif data.get("type") == "Error":
                    print(f"Deepgram error: {data.get('message')}")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Deepgram receive error: {e}")
        finally:
            self._running = False

    async def send_audio(self, pcm16_bytes: bytes) -> None:
        """Send PCM16 audio chunk to Deepgram."""
        if self._running and self.ws:
            await self.ws.send(pcm16_bytes)

    async def get_transcript(self) -> TranscriptSegment:
        """Get next transcript segment (blocking)."""
        return await self._transcript_queue.get()

    async def close(self) -> None:
        """Close the connection."""
        self._running = False
        if self.ws:
            await self.ws.close()
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass


class MockASR:
    """Mock ASR for testing without API keys."""

    def __init__(self, delay: float = 0.15):
        self.delay = delay
        self._queue: asyncio.Queue[TranscriptSegment] = asyncio.Queue()
        self._running = False

    async def connect(self) -> None:
        self._running = True

    async def send_audio(self, pcm16_bytes: bytes) -> None:
        # Simulate processing delay
        await asyncio.sleep(self.delay)

    async def get_transcript(self) -> TranscriptSegment:
        return await self._queue.get()

    def inject_transcript(self, text: str, is_final: bool = True) -> None:
        """Inject a transcript for testing."""
        segment = TranscriptSegment(
            text=text,
            is_final=is_final,
            confidence=0.95,
            start=0.0,
            end=1.0,
        )
        try:
            self._queue.put_nowait(segment)
        except asyncio.QueueFull:
            pass

    async def close(self) -> None:
        self._running = False
