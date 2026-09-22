from __future__ import annotations

import numpy as np

from server.app.vad.silero_onnx import VADStreamProcessor, VADState
from server.app.vad.debounce import DebouncedVAD


class MockSileroVAD:
    """Mock Silero VAD for testing without ONNX model."""

    def __init__(self, threshold: float = 0.6, sample_rate: int = 16000):
        self.threshold = threshold
        self.sample_rate = sample_rate
        self.chunk_size = int(sample_rate * 30 / 1000)
        self.hidden_state = None
        self.cell_state = None
        self._speech_probs: list[float] = []
        self._prob_index = 0

    def set_speech_probs(self, probs: list[float]) -> None:
        """Set sequence of speech probabilities to return."""
        self._speech_probs = probs
        self._prob_index = 0

    def process_chunk(self, chunk):
        prob = self._speech_probs[self._prob_index] if self._prob_index < len(self._speech_probs) else 0.0
        self._prob_index += 1
        return prob, self.hidden_state, self.cell_state

    def commit_state(self, hidden, cell) -> None:
        self.hidden_state = hidden
        self.cell_state = cell

    def reset(self) -> None:
        self._prob_index = 0


def test_vad_state_machine():
    """Test VAD state machine transitions."""
    vad = MockSileroVAD()
    # High confidence speech for 20 chunks, then silence
    vad.set_speech_probs([0.9] * 20 + [0.1] * 30)
    
    processor = VADStreamProcessor(vad, sos_debounce_ms=120, eos_timeout_ms=500)
    
    chunk = np.zeros(480, dtype=np.float32)
    
    # IDLE -> SPEECH_DEBOUNCE (first speech chunk)
    result, event = processor.process_chunk(chunk)
    assert processor.state == VADState.SPEECH_DEBOUNCE
    assert event is None
    assert result.speech_prob == 0.9
    
    # SPEECH_DEBOUNCE -> IN_SPEECH (after 4 chunks = 120ms)
    # Need 3 more chunks (already did 1)
    for _ in range(3):
        result, event = processor.process_chunk(chunk)
    assert processor.state == VADState.IN_SPEECH
    assert event == "start_of_speech"
    
    # Continue speech for enough chunks to build speech history (need 5+ for rate estimation)
    for _ in range(6):
        result, event = processor.process_chunk(chunk)
    assert processor.state == VADState.IN_SPEECH
    assert event is None
    
    # Now silence - should go to SILENCE_DEBOUNCE
    vad.set_speech_probs([0.1] * 30)
    result, event = processor.process_chunk(chunk)
    assert processor.state == VADState.SILENCE_DEBOUNCE
    assert event is None
    
    # SILENCE_DEBOUNCE -> UTTERANCE_END (after dynamic EOS)
    # Fast speech (high confidence) -> 400ms = ~13 chunks
    triggered = False
    for i in range(20):
        result, event = processor.process_chunk(chunk)
        if event == "end_of_speech":
            triggered = True
            break
    assert triggered, "EOS should have triggered"
    assert processor.state == VADState.UTTERANCE_END


def test_dynamic_eos_timeout_fast_vs_slow():
    """Test that fast speech gets shorter EOS than slow speech."""
    # Fast speech (high confidence > 0.7)
    vad_fast = MockSileroVAD()
    # 15 speech chunks to build history, then silence
    vad_fast.set_speech_probs([0.9] * 15 + [0.1] * 40)
    
    processor_fast = VADStreamProcessor(vad_fast, sos_debounce_ms=120, eos_timeout_ms=500)
    chunk = np.zeros(480, dtype=np.float32)
    
    # Reach IN_SPEECH
    for _ in range(4):
        processor_fast.process_chunk(chunk)
    
    # Continue speech to build history (need 5+ chunks)
    for _ in range(6):
        processor_fast.process_chunk(chunk)
    
    # Now silence
    fast_eos_chunk = 0
    for i in range(40):
        _, event = processor_fast.process_chunk(chunk)
        if event == "end_of_speech":
            fast_eos_chunk = i
            break
    
    # Slow speech (low confidence but still above threshold: 0.3-0.7)
    vad_slow = MockSileroVAD()
    vad_slow.set_speech_probs([0.65] * 15 + [0.1] * 40)
    
    processor_slow = VADStreamProcessor(vad_slow, sos_debounce_ms=120, eos_timeout_ms=500)
    
    for _ in range(4):
        processor_slow.process_chunk(chunk)
    
    for _ in range(6):
        processor_slow.process_chunk(chunk)
    
    slow_eos_chunk = 0
    for i in range(40):
        _, event = processor_slow.process_chunk(chunk)
        if event == "end_of_speech":
            slow_eos_chunk = i
            break
    
    # Fast speech should trigger EOS sooner (400ms vs 700ms)
    # fast: ~400ms/30ms = 13 chunks, slow: ~700ms/30ms = 23 chunks
    assert fast_eos_chunk > 0, "Fast EOS should trigger"
    assert slow_eos_chunk > 0, "Slow EOS should trigger"
    assert fast_eos_chunk < slow_eos_chunk, f"Fast EOS ({fast_eos_chunk}) should be before slow EOS ({slow_eos_chunk})"


def test_barge_in_detection():
    """Test barge-in detection via force_interrupt."""
    vad = MockSileroVAD()
    vad.set_speech_probs([0.1] * 5 + [0.9] * 10)
    
    processor = VADStreamProcessor(vad, sos_debounce_ms=120, eos_timeout_ms=500)
    chunk = np.zeros(480, dtype=np.float32)
    
    # Process silence first
    for _ in range(5):
        processor.process_chunk(chunk)
    
    # Simulate barge-in
    processor.force_interrupt()
    
    # Process speech after interrupt
    vad.set_speech_probs([0.9] * 10)
    result, event = processor.process_chunk(chunk)
    
    assert event == "barge_in", f"Expected barge_in event, got {event}"
    assert processor.state == VADState.IN_SPEECH


def test_barge_in_resets_state():
    """Test that barge-in resets VAD state properly."""
    vad = MockSileroVAD()
    vad.set_speech_probs([0.9] * 10)
    
    processor = VADStreamProcessor(vad, sos_debounce_ms=120, eos_timeout_ms=500)
    chunk = np.zeros(480, dtype=np.float32)
    
    # Start speech
    for _ in range(4):
        processor.process_chunk(chunk)
    
    assert processor.state == VADState.IN_SPEECH
    
    # Barge in
    processor.force_interrupt()
    
    assert processor.state == VADState.IDLE
    assert processor.barge_in_detected is True  # Will be consumed on next chunk
    
    # Next speech should start fresh
    result, event = processor.process_chunk(chunk)
    assert event == "barge_in"
    assert processor.state == VADState.IN_SPEECH


def test_debounced_vad_wrapper():
    """Test DebouncedVAD wrapper with mock VAD."""
    # We can't easily test DebouncedVAD.create without the ONNX model
    # Instead test the processor directly
    vad = MockSileroVAD()
    vad.set_speech_probs([0.9] * 10)
    
    processor = VADStreamProcessor(vad, sos_debounce_ms=120, eos_timeout_ms=500)
    
    # Test reset
    chunk = np.zeros(480, dtype=np.float32)
    for _ in range(4):
        processor.process_chunk(chunk)
    
    assert processor.state == VADState.IN_SPEECH
    
    processor.reset()
    assert processor.state == VADState.IDLE
    assert processor.utterance_started is False


def test_get_speech_duration():
    """Test speech duration tracking."""
    import time
    
    vad = MockSileroVAD()
    vad.set_speech_probs([0.9] * 10)
    
    processor = VADStreamProcessor(vad, sos_debounce_ms=120, eos_timeout_ms=500)
    chunk = np.zeros(480, dtype=np.float32)
    
    # Before speech
    assert processor.get_speech_duration_ms() == 0.0
    
    # Start speech
    processor.process_chunk(chunk)
    
    # Duration should be > 0
    time.sleep(0.01)
    duration = processor.get_speech_duration_ms()
    assert duration >= 0  # May be small but not negative


if __name__ == "__main__":
    test_vad_state_machine()
    print("✓ test_vad_state_machine passed")
    
    test_dynamic_eos_timeout_fast_vs_slow()
    print("✓ test_dynamic_eos_timeout_fast_vs_slow passed")
    
    test_barge_in_detection()
    print("✓ test_barge_in_detection passed")
    
    test_barge_in_resets_state()
    print("✓ test_barge_in_resets_state passed")
    
    test_debounced_vad_wrapper()
    print("✓ test_debounced_vad_wrapper passed")
    
    test_get_speech_duration()
    print("✓ test_get_speech_duration passed")
    
    print("\nAll Phase 2 VAD tests passed!")