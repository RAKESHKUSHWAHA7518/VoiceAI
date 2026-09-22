from __future__ import annotations

import asyncio
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Optional

from langfuse import Langfuse


@dataclass(slots=True)
class LatencySpan:
    name: str
    start_time: float = field(default_factory=time.perf_counter)
    end_time: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def duration_ms(self) -> float | None:
        if self.end_time is None:
            return None
        return (self.end_time - self.start_time) * 1000

    def finish(self, **metadata: Any) -> float:
        self.end_time = time.perf_counter()
        self.metadata.update(metadata)
        return self.duration_ms or 0.0


# Standard stage names for consistent tracking
class StageNames:
    VAD = "vad"
    ASR = "asr"
    TTFT = "ttft"          # Time to First Token (LLM)
    TTS_FIRST_CHUNK = "tts_first_chunk"  # Time to First Audio Chunk
    E2E = "e2e"            # End-to-end turn latency
    TOOL_EXEC = "tool_execution"
    TTS_STREAMING = "tts_streaming"


@dataclass(slots=True)
class TurnMetrics:
    """Complete latency breakdown for a single turn."""
    turn_id: str
    session_id: str
    vad_ms: float = 0.0
    asr_ms: float = 0.0
    ttft_ms: float = 0.0
    tts_first_chunk_ms: float = 0.0
    e2e_ms: float = 0.0
    tool_exec_ms: float = 0.0
    tts_streaming_ms: float = 0.0
    interruption_count: int = 0
    timestamp: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "turn_id": self.turn_id,
            "session_id": self.session_id,
            "vad_ms": round(self.vad_ms, 2),
            "asr_ms": round(self.asr_ms, 2),
            "ttft_ms": round(self.ttft_ms, 2),
            "tts_first_chunk_ms": round(self.tts_first_chunk_ms, 2),
            "e2e_ms": round(self.e2e_ms, 2),
            "tool_exec_ms": round(self.tool_exec_ms, 2),
            "tts_streaming_ms": round(self.tts_streaming_ms, 2),
            "interruption_count": self.interruption_count,
            "timestamp": self.timestamp,
            "metadata": self.metadata,
        }


class LatencyTracker:
    """Per-turn latency tracker with Langfuse integration."""

    def __init__(
        self,
        turn_id: str,
        session_id: str,
        langfuse: Langfuse | None = None,
    ):
        self.turn_id = turn_id
        self.session_id = session_id
        self.langfuse = langfuse
        self.spans: dict[str, LatencySpan] = {}
        self._span_order: list[str] = []
        self._e2e_start: float = time.perf_counter()
        self._ttft_recorded: bool = False
        self._tts_first_chunk_recorded: bool = False
        self._interruption_count: int = 0

    @contextmanager
    def span(self, name: str, **metadata: Any):
        span = LatencySpan(name=name, metadata=metadata)
        self.spans[name] = span
        self._span_order.append(name)
        try:
            yield span
        finally:
            span.finish(**metadata)
            self._maybe_emit_to_langfuse(span)

    def mark_ttft(self) -> None:
        """Mark Time-to-First-Token."""
        if not self._ttft_recorded:
            duration = (time.perf_counter() - self._e2e_start) * 1000
            self.spans[StageNames.TTFT] = LatencySpan(
                name=StageNames.TTFT,
                start_time=self._e2e_start,
                end_time=time.perf_counter(),
            )
            self._ttft_recorded = True

    def mark_tts_first_chunk(self) -> None:
        """Mark Time-to-First-Audio-Chunk from TTS."""
        if not self._tts_first_chunk_recorded:
            duration = (time.perf_counter() - self._e2e_start) * 1000
            self.spans[StageNames.TTS_FIRST_CHUNK] = LatencySpan(
                name=StageNames.TTS_FIRST_CHUNK,
                start_time=self._e2e_start,
                end_time=time.perf_counter(),
            )
            self._tts_first_chunk_recorded = True

    def record_interruption(self) -> None:
        """Record a barge-in interruption."""
        self._interruption_count += 1

    def get_metrics(self) -> TurnMetrics:
        """Compile final metrics for this turn."""
        return TurnMetrics(
            turn_id=self.turn_id,
            session_id=self.session_id,
            vad_ms=self.spans.get(StageNames.VAD, LatencySpan("")).duration_ms or 0.0,
            asr_ms=self.spans.get(StageNames.ASR, LatencySpan("")).duration_ms or 0.0,
            ttft_ms=self.spans.get(StageNames.TTFT, LatencySpan("")).duration_ms or 0.0,
            tts_first_chunk_ms=self.spans.get(StageNames.TTS_FIRST_CHUNK, LatencySpan("")).duration_ms or 0.0,
            e2e_ms=(time.perf_counter() - self._e2e_start) * 1000,
            tool_exec_ms=self.spans.get(StageNames.TOOL_EXEC, LatencySpan("")).duration_ms or 0.0,
            tts_streaming_ms=self.spans.get(StageNames.TTS_STREAMING, LatencySpan("")).duration_ms or 0.0,
            interruption_count=self._interruption_count,
            metadata={
                name: span.duration_ms or 0.0 for name, span in self.spans.items()
                if name not in [
                    StageNames.VAD, StageNames.ASR, StageNames.TTFT,
                    StageNames.TTS_FIRST_CHUNK, StageNames.TOOL_EXEC,
                    StageNames.TTS_STREAMING,
                ]
            },
        )

    def _maybe_emit_to_langfuse(self, span: LatencySpan) -> None:
        if self.langfuse is None or span.duration_ms is None:
            return
        try:
            # Emit individual span
            self.langfuse.trace(
                id=f"{self.turn_id}-{span.name}",
                name=f"voice_{span.name}",
                session_id=self.session_id,
                metadata={
                    "duration_ms": round(span.duration_ms, 2),
                    "turn_id": self.turn_id,
                    **span.metadata,
                },
            )
        except Exception:
            pass  # Fail silently for telemetry

    def flush_to_langfuse(self) -> None:
        """Emit complete turn metrics to Langfuse."""
        if self.langfuse is None:
            return
        try:
            metrics = self.get_metrics()
            self.langfuse.trace(
                id=self.turn_id,
                name="voice_turn_complete",
                session_id=self.session_id,
                metadata=metrics.to_dict(),
            )
        except Exception:
            pass


class LatencyContext:
    """Thread-local style context for current turn tracking."""

    _current: Optional[LatencyTracker] = None

    @classmethod
    def set_current(cls, tracker: LatencyTracker) -> None:
        cls._current = tracker

    @classmethod
    def get_current(cls) -> Optional[LatencyTracker]:
        return cls._current

    @classmethod
    def clear(cls) -> None:
        cls._current = None

    @classmethod
    @contextmanager
    def turn(
        cls,
        turn_id: str | None = None,
        session_id: str | None = None,
        langfuse: Langfuse | None = None,
    ):
        tid = turn_id or str(uuid.uuid4())[:8]
        sid = session_id or "unknown"
        tracker = LatencyTracker(tid, sid, langfuse)
        prev = cls._current
        cls._current = tracker
        try:
            yield tracker
        finally:
            cls._current = prev


class MetricsCollector:
    """Aggregates turn metrics for dashboard and alerting."""

    def __init__(self):
        self.turns: list[TurnMetrics] = []
        self._lock = asyncio.Lock()

    async def record(self, metrics: TurnMetrics) -> None:
        async with self._lock:
            self.turns.append(metrics)
            # Keep last 10000 turns
            if len(self.turns) > 10000:
                self.turns = self.turns[-10000:]

    async def get_percentiles(self, window: int = 1000) -> dict[str, float]:
        """Get latency percentiles over recent window."""
        async with self._lock:
            recent = self.turns[-window:] if self.turns else []
            if not recent:
                return {}

            def percentile(data: list[float], p: float) -> float:
                if not data:
                    return 0.0
                sorted_data = sorted(data)
                idx = int(len(sorted_data) * p / 100)
                return sorted_data[min(idx, len(sorted_data) - 1)]

            return {
                "vad_p50": percentile([t.vad_ms for t in recent], 50),
                "vad_p95": percentile([t.vad_ms for t in recent], 95),
                "asr_p50": percentile([t.asr_ms for t in recent], 50),
                "asr_p95": percentile([t.asr_ms for t in recent], 95),
                "ttft_p50": percentile([t.ttft_ms for t in recent], 50),
                "ttft_p95": percentile([t.ttft_ms for t in recent], 95),
                "tts_first_chunk_p50": percentile([t.tts_first_chunk_ms for t in recent], 50),
                "tts_first_chunk_p95": percentile([t.tts_first_chunk_ms for t in recent], 95),
                "e2e_p50": percentile([t.e2e_ms for t in recent], 50),
                "e2e_p95": percentile([t.e2e_ms for t in recent], 95),
                "interruption_rate": sum(t.interruption_count for t in recent) / len(recent),
            }

    async def get_recent_turns(self, limit: int = 100) -> list[dict]:
        async with self._lock:
            return [t.to_dict() for t in self.turns[-limit:]]


# Global metrics collector
_metrics_collector: Optional[MetricsCollector] = None


def get_metrics_collector() -> MetricsCollector:
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = MetricsCollector()
    return _metrics_collector


def get_langfuse_client() -> Langfuse | None:
    from server.app.config import settings

    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return None
    return Langfuse(
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
        host=settings.langfuse_host,
    )