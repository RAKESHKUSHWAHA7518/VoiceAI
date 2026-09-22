from __future__ import annotations

import asyncio
import os
import tempfile
from dataclasses import dataclass, field

import numpy as np


@dataclass(slots=True)
class TranscriptSegment:
    text: str
    is_final: bool
    confidence: float
    start: float
    end: float
    words: list[dict] = field(default_factory=list)


class FasterWhisperASR:
    """Local ASR using faster-whisper (CTranslate2)."""

    def __init__(
        self,
        model_size: str = "base.en",
        device: str = "cpu",
        compute_type: str = "int8",
        sample_rate: int = 16000,
    ):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.sample_rate = sample_rate
        self._model = None
        self._queue: asyncio.Queue[TranscriptSegment] = asyncio.Queue()
        self._buffer: list[np.ndarray] = []
        self._buffer_duration = 0.0
        self._min_buffer_sec = 1.0  # Process after 1 second of audio

    async def load_model(self) -> None:
        """Load the faster-whisper model."""
        from faster_whisper import WhisperModel

        self._model = WhisperModel(
            self.model_size,
            device=self.device,
            compute_type=self.compute_type,
        )

    async def connect(self) -> None:
        if self._model is None:
            await self.load_model()

    async def send_audio(self, pcm16_bytes: bytes) -> None:
        """Buffer audio and process when enough accumulated."""
        arr = np.frombuffer(pcm16_bytes, dtype=np.int16).astype(np.float32) / 32767.0
        self._buffer.append(arr)
        self._buffer_duration += len(arr) / self.sample_rate

        if self._buffer_duration >= self._min_buffer_sec:
            await self._process_buffer()

    async def _process_buffer(self) -> None:
        if not self._buffer:
            return

        audio = np.concatenate(self._buffer)
        self._buffer = []
        self._buffer_duration = 0.0

        # Write to temp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
            import wave
            with wave.open(temp_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(self.sample_rate)
                wf.writeframes((audio * 32767).astype(np.int16).tobytes())

        try:
            # Run transcription in thread pool
            loop = asyncio.get_event_loop()
            segments, info = await loop.run_in_executor(
                None,
                lambda: self._model.transcribe(
                    temp_path,
                    beam_size=5,
                    language="en",
                    condition_on_previous_text=False,
                ),
            )

            for segment in segments:
                transcript = TranscriptSegment(
                    text=segment.text.strip(),
                    is_final=True,
                    confidence=segment.avg_logprob if segment.avg_logprob else 0.0,
                    start=segment.start,
                    end=segment.end,
                    words=[
                        {"word": w.word, "start": w.start, "end": w.end, "confidence": w.probability}
                        for w in segment.words
                    ] if segment.words else [],
                )
                await self._queue.put(transcript)

        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    async def get_transcript(self) -> TranscriptSegment:
        return await self._queue.get()

    async def close(self) -> None:
        if self._buffer:
            await self._process_buffer()
