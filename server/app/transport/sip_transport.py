from __future__ import annotations

import asyncio
import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse, Start, Stream

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
    mulaw_encode,
    mulaw_decode,
    SAMPLE_RATE,
)

logger = logging.getLogger(__name__)


@dataclass
class SIPConfig:
    """SIP trunk configuration."""
    provider: str  # "twilio" | "telnyx"
    account_sid: str
    auth_token: str
    phone_number: str
    webhook_url: str  # Public URL for Twilio webhooks
    sample_rate: int = 8000  # G.711 μ-law is 8kHz
    channels: int = 1


@dataclass
class SIPConnection:
    """Manages a SIP call via Twilio/Telnyx."""
    config: SIPConfig
    call_sid: Optional[str] = None
    stream_sid: Optional[str] = None
    _audio_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    _running: bool = False
    _on_audio_received: Optional[Callable[[bytes], None]] = None
    _on_control_received: Optional[Callable[[dict], None]] = None
    _on_call_ended: Optional[Callable[[], None]] = None
    _webhook_server: Optional[Any] = None


class SIPTransport:
    """
    SIP trunk transport for PSTN connectivity via Twilio/Telnyx.
    
    Handles G.711 μ-law/A-law audio with automatic resampling to/from 16kHz.
    Uses Twilio Media Streams for real-time audio over WebSocket.
    """
    
    def __init__(
        self,
        provider: str = "twilio",
        account_sid: Optional[str] = None,
        auth_token: Optional[str] = None,
        phone_number: Optional[str] = None,
        webhook_url: Optional[str] = None,
    ):
        self.provider = provider
        self.account_sid = account_sid or settings.twilio_account_sid
        self.auth_token = auth_token or settings.twilio_auth_token
        self.phone_number = phone_number or settings.twilio_phone_number
        self.webhook_url = webhook_url or settings.sip_webhook_url
        
        self._twilio_client: Optional[TwilioClient] = None
        self._connections: dict[str, SIPConnection] = {}
        self._webhook_app: Optional[Any] = None
        self._webhook_runner: Optional[Any] = None
    
    async def initialize(self) -> None:
        """Initialize Twilio client and webhook server."""
        if not self.account_sid or not self.auth_token:
            raise ValueError("Twilio account SID and auth token required")
        
        self._twilio_client = TwilioClient(self.account_sid, self.auth_token)
        
        # Start webhook server for Twilio callbacks
        await self._start_webhook_server()
    
    async def _start_webhook_server(self) -> None:
        """Start aiohttp server for Twilio webhooks."""
        from aiohttp import web
        
        self._webhook_app = web.Application()
        self._webhook_app.router.add_post("/voice", self._handle_voice_webhook)
        self._webhook_app.router.add_post("/stream", self._handle_stream_webhook)
        self._webhook_app.router.add_post("/status", self._handle_status_webhook)
        
        self._webhook_runner = web.AppRunner(self._webhook_app)
        await self._webhook_runner.setup()
        site = web.TCPSite(self._webhook_runner, "0.0.0.0", 8081)
        await site.start()
        logger.info("SIP webhook server started on port 8081")
    
    async def _handle_voice_webhook(self, request) -> Any:
        """Handle incoming call webhook from Twilio."""
        from aiohttp import web
        
        form = await request.post()
        call_sid = form.get("CallSid")
        from_number = form.get("From")
        to_number = form.get("To")
        
        logger.info(f"Incoming call: {call_sid} from {from_number} to {to_number}")
        
        # Create TwiML response with Media Stream
        response = VoiceResponse()
        start = Start()
        stream = Stream(
            url=f"{self.webhook_url}/stream",
            track="inbound_track",
        )
        start.append(stream)
        response.append(start)
        
        # Say something while connecting
        response.say("Connecting you to the voice assistant...")
        
        return web.Response(text=str(response), content_type="text/xml")
    
    async def _handle_stream_webhook(self, request) -> Any:
        """Handle Media Stream WebSocket connection from Twilio."""
        from aiohttp import web
        
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        
        stream_sid = None
        call_sid = None
        
        logger.info("Media Stream WebSocket connected")
        
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    event = data.get("event")
                    
                    if event == "start":
                        stream_sid = data.get("streamSid")
                        call_sid = data.get("callSid")
                        logger.info(f"Stream started: {stream_sid} for call {call_sid}")
                        
                        # Find or create connection
                        conn = self._connections.get(call_sid)
                        if conn:
                            conn.stream_sid = stream_sid
                            conn._running = True
                    
                    elif event == "media":
                        # Incoming audio from caller (μ-law)
                        payload = data.get("media", {}).get("payload")
                        if payload:
                            audio_mulaw = base64.b64decode(payload)
                            # Convert μ-law to PCM16 8kHz
                            audio_pcm8k = mulaw_decode(audio_mulaw)
                            # Resample to 16kHz for pipeline
                            audio_float = pcm16_to_float32(audio_pcm8k)
                            audio_16k = resample_audio(audio_float, 8000, 16000)
                            audio_pcm16k = float32_to_pcm16(audio_16k)
                            
                            # Send to pipeline
                            conn = self._connections.get(call_sid)
                            if conn and conn._on_audio_received:
                                conn._on_audio_received(audio_pcm16k)
                    
                    elif event == "stop":
                        logger.info(f"Stream stopped: {stream_sid}")
                        # Handle call end
                        conn = self._connections.get(call_sid)
                        if conn and conn._on_call_ended:
                            conn._on_call_ended()
                        self._connections.pop(call_sid, None)
                
                elif msg.type == web.WSMsgType.ERROR:
                    logger.error(f"WebSocket error: {ws.exception()}")
        
        except Exception as e:
            logger.error(f"Stream WebSocket error: {e}")
        finally:
            await ws.close()
        
        return ws
    
    async def _handle_status_webhook(self, request) -> Any:
        """Handle call status callback."""
        from aiohttp import web
        
        form = await request.post()
        call_sid = form.get("CallSid")
        call_status = form.get("CallStatus")
        
        logger.info(f"Call status: {call_sid} = {call_status}")
        
        if call_status in ("completed", "failed", "busy", "no-answer"):
            self._connections.pop(call_sid, None)
        
        return web.Response(text="OK")
    
    async def make_call(
        self,
        to_number: str,
        on_audio_received: Optional[Callable[[bytes], None]] = None,
        on_control_received: Optional[Callable[[dict], None]] = None,
        on_call_ended: Optional[Callable[[], None]] = None,
    ) -> str:
        """
        Make an outbound call via SIP trunk.
        
        Returns the call SID.
        """
        if not self._twilio_client:
            await self.initialize()
        
        # Create call via Twilio
        call = self._twilio_client.calls.create(
            to=to_number,
            from_=self.phone_number,
            url=f"{self.webhook_url}/voice",
            status_callback=f"{self.webhook_url}/status",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
        )
        
        call_sid = call.sid
        logger.info(f"Outbound call initiated: {call_sid} to {to_number}")
        
        # Store connection info
        conn = SIPConnection(
            config=SIPConfig(
                provider=self.provider,
                account_sid=self.account_sid,
                auth_token=self.auth_token,
                phone_number=self.phone_number,
                webhook_url=self.webhook_url,
            ),
            call_sid=call_sid,
            _on_audio_received=on_audio_received,
            _on_control_received=on_control_received,
            _on_call_ended=on_call_ended,
        )
        self._connections[call_sid] = conn
        
        return call_sid
    
    async def send_audio(self, call_sid: str, audio_bytes: bytes) -> None:
        """
        Send audio to the call via Twilio Media Stream.
        
        Converts 16kHz PCM16 → 8kHz μ-law → base64 for Twilio.
        """
        conn = self._connections.get(call_sid)
        if not conn or not conn.stream_sid:
            return
        
        # Resample 16kHz → 8kHz
        audio_float = pcm16_to_float32(audio_bytes)
        audio_8k = resample_audio(audio_float, 16000, 8000)
        audio_pcm8k = float32_to_pcm16(audio_8k)
        
        # Encode to μ-law
        audio_mulaw = mulaw_encode(audio_pcm8k)
        
        # Base64 encode for Twilio
        payload = base64.b64encode(audio_mulaw).decode("ascii")
        
        # In real implementation, send via WebSocket to Twilio
        # This would require maintaining the Media Stream WebSocket connection
        # For now, we queue it
        await conn._audio_queue.put({
            "event": "media",
            "streamSid": conn.stream_sid,
            "media": {"payload": payload},
        })
    
    async def send_control(self, call_sid: str, control_type: str, payload: dict) -> None:
        """Send control message (e.g., DTMF, hangup)."""
        conn = self._connections.get(call_sid)
        if conn and conn._on_control_received:
            conn._on_control_received({"type": control_type, "payload": payload})
    
    async def hangup(self, call_sid: str) -> None:
        """Hang up a call."""
        if self._twilio_client:
            try:
                self._twilio_client.calls(call_sid).update(status="completed")
            except Exception as e:
                logger.error(f"Failed to hangup call {call_sid}: {e}")
        
        self._connections.pop(call_sid, None)
    
    async def shutdown(self) -> None:
        """Shutdown webhook server."""
        if self._webhook_runner:
            await self._webhook_runner.cleanup()
        self._running = False


class MockSIPTransport:
    """Mock SIP transport for testing without Twilio."""
    
    def __init__(self):
        self._running = False
        self._connections: dict[str, dict] = {}
    
    async def initialize(self) -> None:
        self._running = True
    
    async def make_call(
        self,
        to_number: str,
        on_audio_received: Optional[Callable[[bytes], None]] = None,
        on_control_received: Optional[Callable[[dict], None]] = None,
        on_call_ended: Optional[Callable[[], None]] = None,
    ) -> str:
        call_sid = f"mock-call-{int(asyncio.get_event_loop().time() * 1000)}"
        self._connections[call_sid] = {
            "to_number": to_number,
            "on_audio_received": on_audio_received,
            "on_control_received": on_control_received,
            "on_call_ended": on_call_ended,
        }
        return call_sid
    
    async def send_audio(self, call_sid: str, audio_bytes: bytes) -> None:
        pass  # Mock
    
    async def send_control(self, call_sid: str, control_type: str, payload: dict) -> None:
        pass  # Mock
    
    async def hangup(self, call_sid: str) -> None:
        self._connections.pop(call_sid, None)
    
    async def shutdown(self) -> None:
        self._running = False


def get_sip_transport() -> SIPTransport | MockSIPTransport:
    """Factory function to get SIP transport (real or mock)."""
    if settings.twilio_account_sid and settings.twilio_auth_token:
        return SIPTransport()
    return MockSIPTransport()