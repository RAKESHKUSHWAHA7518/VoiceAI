from __future__ import annotations

import asyncio
import base64
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass

import websockets

from server.app.config import settings


@dataclass(slots=True)
class TTSChunk:
    audio_bytes: bytes
    is_final: bool
    sample_rate: int


class CartesiaTTS:
    """Streaming TTS using Cartesia Sonic via WebSocket."""

    def __init__(
        self,
        api_key: str | None = None,
        voice_id: str | None = None,
        model_id: str = "sonic-english",
        sample_rate: int = 24000,
    ):
        self.api_key = api_key or settings.cartesia_api_key
        if not self.api_key:
            raise ValueError("Cartesia API key required")

        self.voice_id = voice_id or settings.tts_voice_id or "a0e99841-438c-4a64-b679-ae501e7d6091"
        self.model_id = model_id
        self.sample_rate = sample_rate
        self.ws: websockets.WebSocketClientProtocol | None = None
        self._connected = False

    async def connect(self) -> None:
        """Establish WebSocket connection to Cartesia."""
        url = f"wss://api.cartesia.ai/tts/websocket?api_key={self.api_key}&cartesia_version=2024-06-10"
        self.ws = await websockets.connect(url)
        self._connected = True

        # Send init message
        await self.ws.send(json.dumps({
            "type": "init",
            "voice_id": self.voice_id,
            "model_id": self.model_id,
        }))

    async def send_text(self, text: str, flush: bool = False) -> None:
        """Send text chunk for synthesis."""
        if not self._connected or not self.ws:
            raise RuntimeError("Not connected")
        await self.ws.send(json.dumps({
            "type": "generate",
            "text": text,
            "flush": flush,
        }))

    async def receive_audio(self) -> AsyncIterator[TTSChunk]:
        """Receive audio chunks from Cartesia."""
        if not self._connected or not self.ws:
            raise RuntimeError("Not connected")

        async for message in self.ws:
            data = json.loads(message)
            if data.get("type") == "audio":
                audio_b64 = data.get("data", "")
                if audio_b64:
                    audio_bytes = base64.b64decode(audio_b64)
                    yield TTSChunk(
                        audio_bytes=audio_bytes,
                        is_final=data.get("is_final", False),
                        sample_rate=self.sample_rate,
                    )
            elif data.get("type") == "error":
                raise Exception(f"Cartesia error: {data.get('message')}")

    async def close(self) -> None:
        if self.ws and self._connected:
            await self.ws.close()
            self._connected = False


class ElevenLabsTTS:
    """Streaming TTS using ElevenLabs Turbo v2.5 via WebSocket."""

    def __init__(
        self,
        api_key: str | None = None,
        voice_id: str | None = None,
        model_id: str = "eleven_turbo_v2_5",
        sample_rate: int = 24000,
    ):
        self.api_key = api_key or settings.elevenlabs_api_key
        if not self.api_key:
            raise ValueError("ElevenLabs API key required")

        self.voice_id = voice_id or settings.tts_voice_id or "21m00Tcm4TlvDq8ikWAM"
        self.model_id = model_id
        self.sample_rate = sample_rate
        self.ws: websockets.WebSocketClientProtocol | None = None
        self._connected = False

    async def connect(self) -> None:
        """Establish WebSocket connection to ElevenLabs."""
        url = f"wss://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/stream-input?model_id={self.model_id}&output_format=pcm_24000"
        self.ws = await websockets.connect(
            url,
            additional_headers={"xi-api-key": self.api_key},
        )
        self._connected = True

    async def send_text(self, text: str, flush: bool = False) -> None:
        """Send text chunk for synthesis."""
        if not self._connected or not self.ws:
            raise RuntimeError("Not connected")
        await self.ws.send(json.dumps({
            "text": text,
            "try_trigger_generation": flush,
            "generation_config": {
                "chunk_length_schedule": [50, 100, 150],
            },
        }))

    async def receive_audio(self) -> AsyncIterator[TTSChunk]:
        """Receive audio chunks from ElevenLabs."""
        if not self._connected or not self.ws:
            raise RuntimeError("Not connected")

        async for message in self.ws:
            data = json.loads(message)
            if data.get("audio"):
                audio_b64 = data["audio"]
                audio_bytes = base64.b64decode(audio_b64)
                yield TTSChunk(
                    audio_bytes=audio_bytes,
                    is_final=data.get("isFinal", False),
                    sample_rate=self.sample_rate,
                )
            elif data.get("isFinal"):
                yield TTSChunk(audio_bytes=b"", is_final=True, sample_rate=self.sample_rate)

    async def close(self) -> None:
        if self.ws and self._connected:
            await self.ws.send(json.dumps({"text": ""}))  # Flush
            await self.ws.close()
            self._connected = False


class MockTTS:
    """Mock TTS for testing without API keys."""

    def __init__(self, sample_rate: int = 24000, chunk_duration_ms: int = 100):
        self.sample_rate = sample_rate
        self.chunk_duration_ms = chunk_duration_ms
        self._queue: asyncio.Queue[TTSChunk] = asyncio.Queue()
        self._connected = False

    async def connect(self) -> None:
        self._connected = True

    async def send_text(self, text: str, flush: bool = False) -> None:
        if not self._connected:
            raise RuntimeError("Not connected")
        # Generate silence as mock audio
        import numpy as np
        samples = int(self.sample_rate * self.chunk_duration_ms / 1000)
        silence = np.zeros(samples, dtype=np.int16).tobytes()
        await self._queue.put(TTSChunk(
            audio_bytes=silence,
            is_final=flush,
            sample_rate=self.sample_rate,
        ))

    async def receive_audio(self) -> AsyncIterator[TTSChunk]:
        while self._connected:
            try:
                chunk = await asyncio.wait_for(self._queue.get(), timeout=0.1)
                yield chunk
                if chunk.is_final:
                    break
            except asyncio.TimeoutError:
                continue

    async def close(self) -> None:
        self._connected = False
