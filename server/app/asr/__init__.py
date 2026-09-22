from __future__ import annotations

from server.app.asr.deepgram_stream import DeepgramStreamingASR, MockASR, TranscriptSegment
from server.app.asr.whisper_local import FasterWhisperASR
from server.app.asr.whisper_local import TranscriptSegment as WhisperTranscriptSegment

# Re-export TranscriptSegment from deepgram as canonical
__all__ = [
    "DeepgramStreamingASR",
    "FasterWhisperASR",
    "MockASR",
    "TranscriptSegment",
]
