from __future__ import annotations

from server.app.audio.utils import (
    CHUNK_MS,
    FRAME_SIZE,
    SAMPLE_RATE,
    alaw_decode,
    alaw_encode,
    float32_to_pcm16,
    get_audio_chunk_size,
    mulaw_decode,
    mulaw_encode,
    pcm16_to_float32,
    pcm16_to_wav,
    resample_audio,
    split_pcm16_chunks,
)


class TestAudioUtils:
    def test_pcm16_to_float32_roundtrip(self):
        # Test roundtrip for values that can be exactly represented
        # -32768 to 32767 range, but -32768 * 32767/32768 != -32768 exactly
        original = b"\x00\x00" * 100 + b"\xff\x7f" * 100 + b"\x01\x80" * 100  # -32767 instead of -32768
        float_arr = pcm16_to_float32(original)
        back = float32_to_pcm16(float_arr)
        assert back == original

    def test_pcm16_to_float32_normalization(self):
        pcm = b"\x00\x80"  # -32768
        arr = pcm16_to_float32(pcm)
        assert abs(arr[0] - (-1.0)) < 1e-4

        pcm = b"\xff\x7f"  # 32767
        arr = pcm16_to_float32(pcm)
        assert abs(arr[0] - 1.0) < 1e-4

    def test_resample_audio(self):
        import numpy as np
        orig_sr = 48000
        target_sr = 16000
        duration = 0.1
        t = np.linspace(0, duration, int(orig_sr * duration))
        signal = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        resampled = resample_audio(signal, orig_sr, target_sr)
        assert len(resampled) == int(target_sr * duration)
        assert resampled.dtype == np.float32

    def test_resample_audio_same_rate(self):
        import numpy as np
        signal = np.random.randn(1600).astype(np.float32)
        resampled = resample_audio(signal, 16000, 16000)
        assert np.array_equal(signal, resampled)

    def test_mulaw_roundtrip(self):
        original = b"\x00\x00" * 50 + b"\xff\x7f" * 50 + b"\x00\x80" * 50
        encoded = mulaw_encode(original)
        decoded = mulaw_decode(encoded)
        assert len(decoded) == len(original)

    def test_alaw_roundtrip(self):
        original = b"\x00\x00" * 50 + b"\xff\x7f" * 50 + b"\x00\x80" * 50
        encoded = alaw_encode(original)
        decoded = alaw_decode(encoded)
        assert len(decoded) == len(original)

    def test_pcm16_to_wav(self):
        pcm = b"\x00\x00" * 1600
        wav = pcm16_to_wav(pcm, sample_rate=16000, channels=1)
        assert wav[:4] == b"RIFF"
        assert wav[8:12] == b"WAVE"

    def test_get_audio_chunk_size(self):
        size = get_audio_chunk_size(16000, 30, 1)
        assert size == 960  # 16000 * 0.03 * 2 bytes

    def test_split_pcm16_chunks(self):
        pcm = b"\x00\x00" * 1000  # 2000 bytes
        chunks = split_pcm16_chunks(pcm, chunk_size=960)
        assert len(chunks) == 3
        assert len(chunks[0]) == 960
        assert len(chunks[1]) == 960
        assert len(chunks[2]) == 80

    def test_constants(self):
        assert SAMPLE_RATE == 16000
        assert CHUNK_MS == 30
        assert FRAME_SIZE == 960
