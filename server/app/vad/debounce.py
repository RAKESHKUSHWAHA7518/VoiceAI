from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np

from server.app.vad.silero_onnx import SileroVAD, VADResult, VADStreamProcessor, VADState

__all__ = ["DebouncedVAD", "SileroVAD", "VADResult", "VADStreamProcessor", "VADState"]


@dataclass(slots=True)
class DebouncedVAD:
    """High-level VAD with configurable debouncing for turn-taking."""

    processor: VADStreamProcessor
    sample_rate: int = 16000
    chunk_ms: int = 30

    @classmethod
    def create(
        cls,
        threshold: float = 0.6,
        sos_debounce_ms: int = 120,
        eos_timeout_ms: int = 500,
    ) -> "DebouncedVAD":
        vad = SileroVAD(threshold=threshold)
        processor = VADStreamProcessor(
            vad=vad,
            sos_debounce_ms=sos_debounce_ms,
            eos_timeout_ms=eos_timeout_ms,
        )
        return cls(processor=processor, sample_rate=vad.sample_rate, chunk_ms=30)

    def reset(self) -> None:
        """Full reset for new utterance."""
        self.processor.reset()

    def reset_for_barge_in(self) -> None:
        """Reset for barge-in: keep transcript context, clear audio state."""
        self.processor.reset_for_barge_in()

    def force_interrupt(self) -> None:
        """Force interrupt (barge-in from external signal)."""
        self.processor.force_interrupt()

    def get_state(self) -> VADState:
        return self.processor.get_state()

    def get_speech_duration_ms(self) -> float:
        return self.processor.get_speech_duration_ms()

    def process_pcm16(self, pcm16_bytes: bytes) -> tuple[VADResult, Optional[str]]:
        """Process PCM16 bytes (30ms chunk) and return (result, event)."""
        chunk_size = int(self.sample_rate * self.chunk_ms / 1000) * 2  # bytes
        if len(pcm16_bytes) != chunk_size:
            raise ValueError(f"Expected {chunk_size} bytes, got {len(pcm16_bytes)}")

        # Convert PCM16 to float32
        arr = np.frombuffer(pcm16_bytes, dtype=np.int16).astype(np.float32) / 32767.0
        return self.processor.process_chunk(arr)

    def process_float32(self, float32_arr: np.ndarray) -> tuple[VADResult, Optional[str]]:
        """Process float32 array and return (result, event)."""
        return self.processor.process_chunk(float32_arr)