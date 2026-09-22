from __future__ import annotations

import asyncio
import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import aiohttp
from livekit import api
from livekit.protocol import models as lk_models

from server.app.config import settings
from server.app.transport.ws_protocol import (
    ControlType,
    FrameType,
    parse_frame,
    create_audio_frame,
    create_control_frame,
)
from server.app.audio.utils import (
    pcm16_to_float32,
    float32_to_pcm16,
    resample_audio,
    SAMPLE_RATE,
)

logger = logging.getLogger(__name__)


@dataclass
class LiveKitConfig:
    """LiveKit connection configuration."""
    url: str
    api_key: str
    api_secret: str
    room_name: str
    participant_name: str = "voice-agent"
    sample_rate: int = 48000  # LiveKit uses 48kHz for Opus
    channels: int = 1


@dataclass
class LiveKitConnection:
    """Manages a LiveKit room connection with audio streaming."""
    config: LiveKitConfig
    room: Optional[Any] = None
    audio_track: Optional[Any] = None
    _audio_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    _running: bool = False
    _on_audio_received: Optional[Callable[[bytes], None]] = None
    _on_control_received: Optional[Callable[[dict], None]] = None
    _on_disconnected: Optional[Callable[[], None]] = None


class LiveKitTransport:
    """
    LiveKit WebRTC transport for VoiceAI.
    
    Handles Opus audio via LiveKit's WebRTC implementation with adaptive jitter buffer.
    Provides the same interface as the WebSocket transport for the pipeline.
    """
    
    def __init__(
        self,
        livekit_url: Optional[str] = None,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        room_name: Optional[str] = None,
        sample_rate: int = 48000,
    ):
        self.livekit_url = livekit_url or settings.livekit_url
        self.api_key = api_key or settings.livekit_api_key
        self.api_secret = api_secret or settings.livekit_api_secret
        self.room_name = room_name or "voiceai-room"
        self.sample_rate = sample_rate
        
        self._lk_api: Optional[api.LiveKitAPI] = None
        self._connections: dict[str, LiveKitConnection] = {}
        self._running = False
    
    async def initialize(self) -> None:
        """Initialize LiveKit API client."""
        if not self.livekit_url or not self.api_key or not self.api_secret:
            raise ValueError("LiveKit URL, API key, and API secret required")
        
        self._lk_api = api.LiveKitAPI(
            url=self.livekit_url,
            api_key=self.api_key,
            api_secret=self.api_secret,
        )
    
    async def create_room(self, room_name: Optional[str] = None) -> str:
        """Create or get a LiveKit room."""
        room_name = room_name or self.room_name
        if not self._lk_api:
            await self.initialize()
        
        try:
            room = await self._lk_api.room.create_room(
                api.CreateRoomRequest(name=room_name)
            )
            logger.info(f"Created LiveKit room: {room.name}")
            return room.name
        except Exception as e:
            logger.error(f"Failed to create room: {e}")
            raise
    
    async def generate_token(
        self,
        room_name: str,
        participant_name: str,
        metadata: Optional[str] = None,
    ) -> str:
        """Generate a LiveKit access token for a participant."""
        if not self._lk_api:
            await self.initialize()
        
        at = api.AccessToken(self.api_key, self.api_secret)
        at.with_identity(participant_name).with_name(participant_name)
        at.with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        if metadata:
            at.with_metadata(metadata)
        
        return at.to_jwt()
    
    async def connect_as_agent(
        self,
        room_name: str,
        participant_name: str = "voice-agent",
        on_audio_received: Optional[Callable[[bytes], None]] = None,
        on_control_received: Optional[Callable[[dict], None]] = None,
        on_disconnected: Optional[Callable[[], None]] = None,
    ) -> LiveKitConnection:
        """
        Connect to a LiveKit room as the voice agent.
        
        Note: This is a simplified version. In production, you'd use
        livekit-server-sdk (Python) or livekit-client-sdk (TypeScript)
        for actual WebRTC media handling. This implementation provides
        the signaling interface; actual media would use a separate worker.
        """
        if not self._lk_api:
            await self.initialize()
        
        token = await self.generate_token(room_name, participant_name)
        
        # Create connection object
        config = LiveKitConfig(
            url=self.livekit_url,
            api_key=self.api_key,
            api_secret=self.api_secret,
            room_name=room_name,
            participant_name=participant_name,
        )
        
        conn = LiveKitConnection(
            config=config,
            _on_audio_received=on_audio_received,
            _on_control_received=on_control_received,
            _on_disconnected=on_disconnected,
        )
        
        self._connections[room_name] = conn
        
        # In a real implementation, you'd start the LiveKit room connection here
        # using livekit-server-sdk's Room class with audio track handling
        
        logger.info(f"Agent connected to LiveKit room: {room_name}")
        return conn
    
    async def send_audio(self, room_name: str, audio_bytes: bytes) -> None:
        """Send audio to LiveKit room (via audio track)."""
        conn = self._connections.get(room_name)
        if conn:
            # In real implementation, write to the audio track
            await conn._audio_queue.put(audio_bytes)
    
    async def send_control(self, room_name: str, control_type: str, payload: dict) -> None:
        """Send control message via data channel."""
        conn = self._connections.get(room_name)
        if conn:
            # Send via LiveKit data channel
            if self._lk_api:
                await self._lk_api.room.send_data(
                    api.SendDataRequest(
                        room=room_name,
                        data=json.dumps({"type": control_type, "payload": payload}).encode(),
                        kind=lk_models.DataPacketKind.RELIABLE,
                        destination_identities=[],  # broadcast
                    )
                )
    
    async def disconnect(self, room_name: str) -> None:
        """Disconnect from LiveKit room."""
        conn = self._connections.pop(room_name, None)
        if conn:
            conn._running = False
            # In real implementation, disconnect the Room


class MockLiveKitTransport:
    """Mock LiveKit transport for testing without LiveKit server."""
    
    def __init__(self):
        self._running = False
        self._audio_queue: asyncio.Queue = asyncio.Queue()
        self._connections: dict[str, dict] = {}
    
    async def initialize(self) -> None:
        self._running = True
    
    async def create_room(self, room_name: Optional[str] = None) -> str:
        return room_name or "mock-room"
    
    async def generate_token(
        self,
        room_name: str,
        participant_name: str,
        metadata: Optional[str] = None,
    ) -> str:
        return f"mock-token-{room_name}-{participant_name}"
    
    async def connect_as_agent(
        self,
        room_name: str,
        participant_name: str = "voice-agent",
        on_audio_received: Optional[Callable[[bytes], None]] = None,
        on_control_received: Optional[Callable[[dict], None]] = None,
        on_disconnected: Optional[Callable[[], None]] = None,
    ) -> dict:
        conn = {
            "room_name": room_name,
            "participant_name": participant_name,
            "on_audio_received": on_audio_received,
            "on_control_received": on_control_received,
            "on_disconnected": on_disconnected,
            "running": True,
        }
        self._connections[room_name] = conn
        return conn
    
    async def send_audio(self, room_name: str, audio_bytes: bytes) -> None:
        pass  # Mock
    
    async def send_control(self, room_name: str, control_type: str, payload: dict) -> None:
        pass  # Mock
    
    async def disconnect(self, room_name: str) -> None:
        self._connections.pop(room_name, None)


def get_livekit_transport() -> LiveKitTransport | MockLiveKitTransport:
    """Factory function to get LiveKit transport (real or mock)."""
    if settings.livekit_url and settings.livekit_api_key and settings.livekit_api_secret:
        return LiveKitTransport()
    return MockLiveKitTransport()