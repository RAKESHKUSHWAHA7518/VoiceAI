from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from server.app.asr import DeepgramStreamingASR, MockASR, TranscriptSegment
from server.app.audio.utils import float32_to_pcm16, pcm16_to_float32, resample_audio
from server.app.config import settings
from server.app.llm import (
    HallucinationChecker,
    SentenceChunker,
    SpeculativeLLM,
    StreamingLLM,
    ToolExecutor,
    ToolRegistry,
    Tool,
    StreamingToolExecutor,
    ToolResult,
)
from server.app.memory import MemoryManager, MemoryPersistenceManager
from server.app.session.state_machine import SessionStateMachine
from server.app.telemetry.latency_spans import LatencyContext, get_langfuse_client
from server.app.transport.ws_protocol import (
    ControlType,
    FrameType,
    create_control_frame,
    parse_frame,
)
from server.app.tts import CartesiaTTS, ElevenLabsTTS, MockTTS
from server.app.vad import DebouncedVAD

logging.basicConfig(level=getattr(logging, settings.log_level))
logger = logging.getLogger(__name__)

active_sessions: dict[str, SessionStateMachine] = {}


@dataclass
class PipelineComponents:
    vad: DebouncedVAD
    asr: DeepgramStreamingASR | MockASR
    llm: StreamingLLM
    chunker: SentenceChunker
    speculative: SpeculativeLLM
    tts: CartesiaTTS | ElevenLabsTTS | MockTTS
    tool_registry: ToolRegistry
    tool_executor: ToolExecutor
    streaming_tool_executor: StreamingToolExecutor
    hallucination_checker: HallucinationChecker
    memory: MemoryManager
    persistence: MemoryPersistenceManager | None = None


async def create_pipeline_components() -> PipelineComponents:
    """Create all pipeline components for a session."""
    # VAD with dynamic EOS
    vad = DebouncedVAD.create(
        threshold=settings.vad_threshold,
        sos_debounce_ms=settings.vad_sos_debounce_ms,
        eos_timeout_ms=settings.vad_eos_timeout_ms,  # Base timeout, dynamic will adjust
    )

    # ASR - use mock if no API key
    if settings.deepgram_api_key:
        asr = DeepgramStreamingASR()
        await asr.connect()
    else:
        asr = MockASR()

    # LLM
    llm = StreamingLLM()
    chunker = SentenceChunker()
    speculative = SpeculativeLLM(llm)

    # TTS - use mock if no API keys
    tts_provider = settings.tts_provider.lower()
    if tts_provider == "cartesia" and settings.cartesia_api_key:
        tts = CartesiaTTS()
        await tts.connect()
    elif tts_provider == "elevenlabs" and settings.elevenlabs_api_key:
        tts = ElevenLabsTTS()
        await tts.connect()
    else:
        tts = MockTTS()
        await tts.connect()

    # Tools
    tool_registry = ToolRegistry()
    
    # Register demo tools
    async def get_weather(args: dict) -> dict:
        location = args.get("location", "unknown")
        await asyncio.sleep(0.8)  # Simulate API call
        return {
            "location": location,
            "temperature": 72,
            "condition": "sunny",
            "humidity": 45,
        }

    async def check_booking(args: dict) -> dict:
        booking_id = args.get("booking_id", "unknown")
        await asyncio.sleep(1.2)  # Simulate API call
        return {
            "booking_id": booking_id,
            "status": "confirmed",
            "date": "2024-12-25",
            "time": "14:30",
            "party_size": 4,
        }

    async def transfer_call(args: dict) -> dict:
        department = args.get("department", "support")
        await asyncio.sleep(0.5)
        return {
            "transferred_to": department,
            "estimated_wait": "2 minutes",
        }

    tool_registry.register(Tool(
        name="get_weather",
        description="Get current weather for a location",
        parameters={
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City name or location"},
            },
            "required": ["location"],
        },
        handler=get_weather,
    ))

    tool_registry.register(Tool(
        name="check_booking",
        description="Check booking status by ID",
        parameters={
            "type": "object",
            "properties": {
                "booking_id": {"type": "string", "description": "Booking reference ID"},
            },
            "required": ["booking_id"],
        },
        handler=check_booking,
    ))

    tool_registry.register(Tool(
        name="transfer_call",
        description="Transfer call to a department",
        parameters={
            "type": "object",
            "properties": {
                "department": {"type": "string", "description": "Department name"},
            },
            "required": ["department"],
        },
        handler=transfer_call,
    ))

    tool_executor = ToolExecutor(tool_registry, tts_callback=None)  # Will be set per-turn
    streaming_tool_executor = StreamingToolExecutor(tool_executor)
    hallucination_checker = HallucinationChecker()

    # Memory
    memory = MemoryManager(user_id="anonymous")
    memory.short_term._llm = llm  # For background summarization

    # Persistence (optional - only if configured)
    persistence = None
    try:
        persistence = MemoryPersistenceManager()
        await persistence.initialize()
    except Exception as e:
        logger.warning(f"Memory persistence not available: {e}")

    return PipelineComponents(
        vad=vad,
        asr=asr,
        llm=llm,
        chunker=chunker,
        speculative=speculative,
        tts=tts,
        tool_registry=tool_registry,
        tool_executor=tool_executor,
        streaming_tool_executor=streaming_tool_executor,
        hallucination_checker=hallucination_checker,
        memory=memory,
        persistence=persistence,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting VoiceAI server...")
    yield
    logger.info("Shutting down VoiceAI server...")
    for session in active_sessions.values():
        session.end_session()
    # Close persistence if available
    # Note: In production, persistence would be app.state


app = FastAPI(title="VoiceAI", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "active_sessions": len(active_sessions)}


class TurnProcessor:
    """Process a complete turn with streaming LLM→TTS and barge-in support."""

    def __init__(
        self,
        websocket: WebSocket,
        session: SessionStateMachine,
        components: PipelineComponents,
        langfuse,
        sequence: int,
    ):
        self.ws = websocket
        self.session = session
        self.components = components
        self.langfuse = langfuse
        self.sequence = sequence
        self.turn_id = ""
        self.interrupted = False

    async def send_flush_buffer(self) -> None:
        """Send FLUSH_BUFFER to client for immediate mute (<50ms target)."""
        await self.ws.send_bytes(
            create_control_frame(ControlType.FLUSH_BUFFER, {}, self.sequence)
        )
        self.sequence += 1

    async def send_audio_chunk(self, audio_bytes: bytes) -> None:
        """Send audio frame to client."""
        for i in range(0, len(audio_bytes), 960):
            frame = audio_bytes[i : i + 960]
            await self.ws.send_bytes(
                create_control_frame(ControlType.AUDIO, frame, self.sequence)
            )
            self.sequence += 1

    async def send_transcript(self, text: str, is_final: bool = False) -> None:
        """Send transcript update to client."""
        await self.ws.send_bytes(
            create_control_frame(
                ControlType.TRANSCRIPT, {"text": text, "is_final": is_final}, self.sequence
            )
        )
        self.sequence += 1

    async def run(
        self, audio_chunks: list[bytes], turn_id: str
    ) -> tuple[int, bool]:
        """Process turn: VAD→ASR→LLM→TTS with barge-in support."""
        self.turn_id = turn_id
        self.session.new_turn(turn_id)

        with LatencyContext.turn(turn_id, self.langfuse) as tracker:
            # Inject preserved context from previous interruption
            preserved_context = self.session.get_preserved_context()
            if preserved_context:
                logger.debug(f"Turn {turn_id}: Injecting preserved context")

            # --- VAD (already done in message loop, but verify) ---
            with tracker.span("vad"):
                self.components.vad.reset()
                # Audio chunks already validated by VAD in message loop

            # --- ASR ---
            with tracker.span("asr"):
                full_audio = b"".join(audio_chunks)
                await self.components.asr.send_audio(full_audio)

                user_transcript = ""
                async with tracker.span("asr_wait"):
                    while True:
                        try:
                            segment: TranscriptSegment = await asyncio.wait_for(
                                self.components.asr.get_transcript(), timeout=2.0
                            )
                            user_transcript = segment.text
                            await self.send_transcript(user_transcript, segment.is_final)
                            if segment.is_final:
                                break
                        except asyncio.TimeoutError:
                            break

                if not user_transcript.strip():
                    logger.warning(f"Turn {turn_id}: Empty transcript")
                    return self.sequence, False

                # Add preserved context to transcript if available
                if preserved_context:
                    user_transcript = f"[Context: {preserved_context}] {user_transcript}"

                # Store in turn
                if self.session.current_turn:
                    self.session.current_turn.user_transcript = user_transcript

            # --- LLM + TTS Streaming ---
            with tracker.span("llm_tts"):
                tools_schema = self.components.tool_registry.get_schema()

                # Build history with preserved context
                history = []
                for t in self.session.turn_history[:-1]:
                    if t.user_transcript:
                        history.append({"role": "user", "content": t.user_transcript})
                    if t.preserved_context and t.interrupted:
                        history.append({
                            "role": "assistant",
                            "content": f"[Interrupted previously] {t.preserved_context}",
                        })

                self.session.start_speaking()

                async for token in self.components.llm.stream_chat(
                    history=history,
                    user_text=user_transcript,
                    tools=tools_schema if tools_schema else None,
                ):
                    # Check for barge-in (sub-50ms target)
                    if self.session.is_cancelled:
                        self.interrupted = True
                        logger.info(f"Turn {turn_id}: Barge-in detected, flushing")
                        await self.send_flush_buffer()
                        self.components.chunker.reset()
                        # TTS cleanup
                        await self.components.tts.close()
                        self.components.tts = await self._recreate_tts()
                        break

                    if token.is_tool_call:
                        await self._handle_tool_call(token)
                    elif token.text:
                        await self._handle_text_token(token)

                # Flush remaining
                if not self.interrupted:
                    final_chunk = self.components.chunker.flush()
                    if final_chunk:
                        await self.components.tts.send_text(final_chunk, flush=True)
                        async for tts_chunk in self.components.tts.receive_audio():
                            if self.session.is_cancelled:
                                self.interrupted = True
                                await self.send_flush_buffer()
                                break
                            if tts_chunk.audio_bytes:
                                await self._send_tts_audio(tts_chunk)

        if self.interrupted:
            self.session.interrupt()
            # Context already preserved in session.interrupt()

        return self.sequence, self.interrupted

    async def _handle_tool_call(self, token) -> None:
        """Execute tool call with filler audio, circuit breaker, and hallucination check."""
        tool_name = token.tool_name
        tool_args = json.loads(token.tool_args) if token.tool_args else {}

        # Set TTS callback for filler audio
        async def on_filler(text: str):
            await self.send_transcript(text, is_final=False)
            await self.components.tts.send_text(text, flush=True)
            async for tts_chunk in self.components.tts.receive_audio():
                if tts_chunk.audio_bytes:
                    await self._send_tts_audio(tts_chunk)

        # Update tool executor TTS callback
        self.components.tool_executor.tts_callback = on_filler

        try:
            tool_result = await self.components.streaming_tool_executor.execute_and_stream(
                tool_name=tool_name,
                arguments=tool_args,
                on_filler=on_filler,
                on_result=lambda tr: logger.info(f"Tool {tool_name} result: {tr}"),
            )

            # Hallucination check if tool succeeded and we have LLM text
            if tool_result.success and self.session.current_turn:
                llm_text = "".join(self.session.current_turn.llm_tokens)
                if llm_text:
                    passed, mismatches = self.components.hallucination_checker.check(
                        llm_text, tool_result.result
                    )
                    if not passed:
                        logger.warning(f"Hallucination detected: {mismatches}")
                        # Could trigger correction here

            logger.info(f"Tool {tool_name} completed: {tool_result}")

        except Exception as e:
            logger.exception(f"Tool {tool_name} failed: {e}")

    async def _handle_text_token(self, token) -> None:
        """Process text token through chunker → TTS."""
        chunks = self.components.chunker.add(token.text)
        for chunk_text in chunks:
            if self.session.is_cancelled:
                self.interrupted = True
                await self.send_flush_buffer()
                return

            await self.components.tts.send_text(chunk_text, flush=False)
            async for tts_chunk in self.components.tts.receive_audio():
                if self.session.is_cancelled:
                    self.interrupted = True
                    await self.send_flush_buffer()
                    return
                if tts_chunk.audio_bytes:
                    await self._send_tts_audio(tts_chunk)

    async def _send_tts_audio(self, tts_chunk) -> None:
        """Resample and send TTS audio to client."""
        if tts_chunk.sample_rate != 16000:
            float_audio = pcm16_to_float32(tts_chunk.audio_bytes)
            resampled = resample_audio(float_audio, tts_chunk.sample_rate, 16000)
            audio_out = float32_to_pcm16(resampled)
        else:
            audio_out = tts_chunk.audio_bytes

        await self.send_audio_chunk(audio_out)

    async def _recreate_tts(self):
        """Recreate TTS connection after interruption."""
        tts_provider = settings.tts_provider.lower()
        if tts_provider == "cartesia" and settings.cartesia_api_key:
            tts = CartesiaTTS()
        elif tts_provider == "elevenlabs" and settings.elevenlabs_api_key:
            tts = ElevenLabsTTS()
        else:
            tts = MockTTS()
        await tts.connect()
        return tts


async def process_turn(
    websocket: WebSocket,
    session: SessionStateMachine,
    components: PipelineComponents,
    audio_chunks: list[bytes],
    sequence: int,
    langfuse,
) -> tuple[int, bool]:
    """Entry point for turn processing."""
    processor = TurnProcessor(websocket, session, components, langfuse, sequence)
    turn_id = f"turn_{session._turn_counter + 1}"
    return await processor.run(audio_chunks, turn_id)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session_id = str(uuid.uuid4())[:8]
    session = SessionStateMachine(session_id)
    active_sessions[session_id] = session
    langfuse = get_langfuse_client()

    sequence = 0
    audio_buffer: list[bytes] = []

    logger.info(f"Session {session_id} connected")

    components = await create_pipeline_components()

    try:
        # Send session start
        await websocket.send_bytes(
            create_control_frame(ControlType.SESSION_START, {"session_id": session_id}, sequence)
        )
        sequence += 1

        session.start_session()

        while True:
            try:
                data = await websocket.receive_bytes()
                parsed = parse_frame(data)
                if parsed is None:
                    continue

                frame_type, _, payload = parsed

                if frame_type == FrameType.AUDIO:
                    # Real-time VAD processing for barge-in detection
                    vad_result, vad_event = components.vad.process_pcm16(payload)
                    
                    if vad_event == "barge_in":
                        # Immediate barge-in handling (<50ms target)
                        logger.info(f"Session {session_id}: Barge-in detected via VAD")
                        session.interrupt()
                        components.vad.reset_for_barge_in()
                        await websocket.send_bytes(
                            create_control_frame(ControlType.FLUSH_BUFFER, {}, sequence)
                        )
                        sequence += 1
                        audio_buffer.clear()
                        # Recreate TTS to clear any pending audio
                        await components.tts.close()
                        components.tts = await _recreate_tts(components)
                        continue

                    elif vad_event == "start_of_speech":
                        logger.debug(f"Session {session_id}: Start of speech detected")
                    
                    elif vad_event == "end_of_speech":
                        logger.debug(f"Session {session_id}: End of speech detected")

                    audio_buffer.append(payload)

                elif frame_type == FrameType.CONTROL:
                    try:
                        control = json.loads(payload.decode("utf-8"))
                        ctype = control.get("type")

                        if ctype == ControlType.START_SPEAKING:
                            session.start_speaking()

                        elif ctype == ControlType.STOP_SPEAKING:
                            if audio_buffer:
                                sequence, interrupted = await process_turn(
                                    websocket, session, components, audio_buffer, sequence, langfuse
                                )
                                audio_buffer.clear()
                                if interrupted:
                                    # Recreate TTS after interruption
                                    await components.tts.close()
                                    components.tts = await _recreate_tts(components)

                        elif ctype == ControlType.INTERRUPT:
                            session.interrupt()
                            components.vad.force_interrupt()
                            await websocket.send_bytes(
                                create_control_frame(ControlType.FLUSH_BUFFER, {}, sequence)
                            )
                            sequence += 1
                            audio_buffer.clear()
                            await components.tts.close()
                            components.tts = await _recreate_tts(components)

                        elif ctype == ControlType.PING:
                            await websocket.send_bytes(
                                create_control_frame(ControlType.PONG, {}, sequence)
                            )
                            sequence += 1

                    except json.JSONDecodeError:
                        logger.warning(f"Invalid control frame: {payload}")

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.exception(f"Error handling message: {e}")
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception(f"Session {session_id} error: {e}")
    finally:
        await components.asr.close()
        await components.tts.close()
        session.end_session()
        active_sessions.pop(session_id, None)
        logger.info(f"Session {session_id} disconnected")


async def _recreate_tts(components: PipelineComponents):
    """Recreate TTS connection."""
    tts_provider = settings.tts_provider.lower()
    if tts_provider == "cartesia" and settings.cartesia_api_key:
        tts = CartesiaTTS()
    elif tts_provider == "elevenlabs" and settings.elevenlabs_api_key:
        tts = ElevenLabsTTS()
    else:
        tts = MockTTS()
    await tts.connect()
    return tts


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )