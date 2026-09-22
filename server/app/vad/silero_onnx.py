from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import numpy as np
import onnxruntime as ort

from server.app.config import settings


class VADState(str, Enum):
    """VAD state machine states."""
    IDLE = "idle"                    # Waiting for speech
    SPEECH_DEBOUNCE = "speech_debounce"  # Potential start of speech
    IN_SPEECH = "in_speech"          # Confirmed speech ongoing
    SILENCE_DEBOUNCE = "silence_debounce"  # Potential end of speech
    UTTERANCE_END = "utterance_end"  # End detected


@dataclass(slots=True)
class VADResult:
    speech_prob: float
    is_speech: bool
    state: VADState
    timestamp_ms: float


class SileroVAD:
    """ONNX-based Silero VAD for 30ms chunks at 16kHz."""

    def __init__(
        self,
        model_path: str | None = None,
        threshold: float = 0.6,
        sample_rate: int = 16000,
    ):
        self.threshold = threshold
        self.sample_rate = sample_rate
        self.chunk_size = int(sample_rate * 30 / 1000)  # 480 samples for 30ms

        if model_path is None:
            model_path = os.path.join(os.path.dirname(__file__), "silero_vad.onnx")

        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Silero VAD model not found at {model_path}. "
                "Download from https://github.com/snakers4/silero-vad/raw/master/files/silero_vad.onnx",
            )

        self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.sr_input_name = self.session.get_inputs()[1].name
        self.hidden_state = np.zeros((2, 1, 128), dtype=np.float32)
        self.cell_state = np.zeros((2, 1, 128), dtype=np.float32)

    def reset(self) -> None:
        """Reset hidden states for new utterance."""
        self.hidden_state.fill(0)
        self.cell_state.fill(0)

    def process_chunk(self, chunk: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
        """
        Process a single 30ms chunk (480 samples at 16kHz).
        Returns (speech_prob, new_hidden_state, new_cell_state).
        """
        if len(chunk) != self.chunk_size:
            raise ValueError(f"Expected {self.chunk_size} samples, got {len(chunk)}")

        input_data = chunk.reshape(1, -1).astype(np.float32)
        sr = np.array([self.sample_rate], dtype=np.int64)

        outputs = self.session.run(
            None,
            {
                self.input_name: input_data,
                self.sr_input_name: sr,
                "h": self.hidden_state,
                "c": self.cell_state,
            },
        )

        speech_prob = float(outputs[0][0, 0])
        new_hidden = outputs[1]
        new_cell = outputs[2]

        return speech_prob, new_hidden, new_cell

    def commit_state(self, hidden: np.ndarray, cell: np.ndarray) -> None:
        """Commit hidden/cell states (call after successful processing)."""
        self.hidden_state = hidden
        self.cell_state = cell


class VADStreamProcessor:
    """
    Manages VAD state machine with dynamic debouncing for turn detection.
    
    Features:
    - Start-of-Speech debounce: 100-150ms sustained speech (configurable)
    - Dynamic End-of-Speech timeout: 
      * 400ms for fast questions (high speech rate)
      * 700ms for thoughtful pauses (low speech rate)
    - End-of-turn prediction using speech rate heuristics
    - Barge-in detection with immediate interrupt signal
    """

    # EOS timeout bounds
    EOS_FAST_MS = 400
    EOS_SLOW_MS = 700

    def __init__(
        self,
        vad: SileroVAD,
        sos_debounce_ms: int = 120,
        eos_timeout_ms: int = 500,
    ):
        self.vad = vad
        self.threshold = vad.threshold
        self.sos_debounce_ms = sos_debounce_ms
        self.base_eos_timeout_ms = eos_timeout_ms
        self.chunk_ms = 30

        self.sos_required_chunks = max(1, sos_debounce_ms // self.chunk_ms)

        # State machine
        self.state = VADState.IDLE
        self.speech_chunk_count = 0
        self.silence_chunk_count = 0
        self.utterance_started = False
        self.utterance_start_time: float = 0
        self.last_speech_time: float = 0
        self.speech_chunk_history: list[float] = []  # Track speech probs DURING speech
        self.captured_speech_rate: float = 0.0  # Frozen rate at speech->silence transition

        # Barge-in
        self.barge_in_detected = False

    def reset(self) -> None:
        """Full reset for new session/utterance."""
        self.vad.reset()
        self.state = VADState.IDLE
        self.speech_chunk_count = 0
        self.silence_chunk_count = 0
        self.utterance_started = False
        self.utterance_start_time = 0
        self.last_speech_time = 0
        self.speech_chunk_history = []
        self.captured_speech_rate = 0.0
        self.barge_in_detected = False

    def reset_for_barge_in(self) -> None:
        """Reset for barge-in: keep transcript context, clear audio state."""
        self.vad.reset()
        self.state = VADState.IDLE
        self.speech_chunk_count = 0
        self.silence_chunk_count = 0
        self.utterance_started = False
        self.utterance_start_time = 0
        self.last_speech_time = 0
        self.speech_chunk_history = []
        self.captured_speech_rate = 0.0
        self.barge_in_detected = True

    def _estimate_speech_rate(self) -> float:
        """Estimate speech rate from recent history (chunks per second)."""
        if len(self.speech_chunk_history) < 5:
            return 0.0
        # Average speech probability over recent chunks
        recent = self.speech_chunk_history[-10:]
        return sum(recent) / len(recent)

    def _get_dynamic_eos_timeout(self) -> int:
        """
        Calculate dynamic EOS timeout based on speech pattern.
        Fast questions -> 400ms, thoughtful pauses -> 700ms.
        """
        speech_rate = self._estimate_speech_rate()
        
        if speech_rate > 0.7:
            # High confidence, fast speech -> shorter timeout
            return self.EOS_FAST_MS
        elif speech_rate < 0.3:
            # Low confidence, hesitant speech -> longer timeout
            return self.EOS_SLOW_MS
        else:
            # Linear interpolation
            ratio = (speech_rate - 0.3) / 0.4
            return int(self.EOS_SLOW_MS - ratio * (self.EOS_SLOW_MS - self.EOS_FAST_MS))

    def process_chunk(self, chunk: np.ndarray) -> tuple[VADResult, Optional[str]]:
        """
        Process chunk and return (VADResult, event).
        Events: 'start_of_speech', 'end_of_speech', 'barge_in', or None
        """
        current_time = time.time() * 1000
        speech_prob, new_hidden, new_cell = self.vad.process_chunk(chunk)
        is_speech = speech_prob >= self.threshold

        # Track speech probability history ONLY during IN_SPEECH for rate estimation
        if self.state == VADState.IN_SPEECH and is_speech:
            self.speech_chunk_history.append(speech_prob)
            if len(self.speech_chunk_history) > 20:
                self.speech_chunk_history.pop(0)

        result = VADResult(
            speech_prob=speech_prob,
            is_speech=is_speech,
            state=self.state,
            timestamp_ms=current_time,
        )

        # Barge-in detection: speech detected while bot is speaking
        # This is signaled externally, but we can detect rapid speech after silence
        if is_speech and not self.utterance_started and self.state == VADState.IDLE:
            # Check if this looks like an interruption (rapid onset after recent speech)
            if self.barge_in_detected:
                self.barge_in_detected = False
                self.utterance_start_time = current_time
                self.last_speech_time = current_time
                self.speech_chunk_count = 1
                self.state = VADState.IN_SPEECH
                self.vad.commit_state(new_hidden, new_cell)
                return result, "barge_in"

        # State machine transitions
        if self.state == VADState.IDLE:
            if is_speech:
                self.state = VADState.SPEECH_DEBOUNCE
                self.speech_chunk_count = 1
                self.utterance_start_time = current_time
            else:
                self.speech_chunk_count = 0

        elif self.state == VADState.SPEECH_DEBOUNCE:
            if is_speech:
                self.speech_chunk_count += 1
                if self.speech_chunk_count >= self.sos_required_chunks:
                    self.state = VADState.IN_SPEECH
                    self.utterance_started = True
                    self.last_speech_time = current_time
                    # Reset speech history for new utterance
                    self.speech_chunk_history = []
                    self.captured_speech_rate = 0.0
                    self.vad.commit_state(new_hidden, new_cell)
                    return result, "start_of_speech"
            else:
                # False alarm, back to idle
                self.state = VADState.IDLE
                self.speech_chunk_count = 0

        elif self.state == VADState.IN_SPEECH:
            if is_speech:
                self.silence_chunk_count = 0
                self.last_speech_time = current_time
                self.vad.commit_state(new_hidden, new_cell)
            else:
                # Transition IN_SPEECH -> SILENCE_DEBOUNCE
                # Capture speech rate at this moment for dynamic EOS
                self.captured_speech_rate = self._estimate_speech_rate()
                self.state = VADState.SILENCE_DEBOUNCE
                self.silence_chunk_count = 1
                # Don't commit state yet - might be brief pause

        elif self.state == VADState.SILENCE_DEBOUNCE:
            if is_speech:
                # Speech resumed, back to IN_SPEECH
                self.state = VADState.IN_SPEECH
                self.silence_chunk_count = 0
                self.last_speech_time = current_time
                self.vad.commit_state(new_hidden, new_cell)
            else:
                self.silence_chunk_count += 1
                dynamic_eos = self._get_dynamic_eos_timeout()
                eos_required_chunks = max(1, dynamic_eos // self.chunk_ms)
                
                if self.silence_chunk_count >= eos_required_chunks:
                    self.state = VADState.UTTERANCE_END
                    return result, "end_of_speech"

        elif self.state == VADState.UTTERANCE_END:
            # Terminal state - wait for explicit reset
            if is_speech:
                # New utterance starting
                self.reset()
                return self.process_chunk(chunk)

        return result, None

    def force_interrupt(self) -> None:
        """Force interrupt (barge-in from external signal)."""
        self.barge_in_detected = True
        self.reset_for_barge_in()

    def get_state(self) -> VADState:
        return self.state

    def get_speech_duration_ms(self) -> float:
        """Get duration of current utterance in ms."""
        if self.utterance_start_time == 0:
            return 0.0
        return (time.time() * 1000) - self.utterance_start_time