from __future__ import annotations

import io
import wave

import numpy as np
from scipy import signal

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_MS = 30
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_MS / 1000)
DTYPE = np.int16
BYTES_PER_SAMPLE = 2
FRAME_SIZE = CHUNK_SAMPLES * CHANNELS * BYTES_PER_SAMPLE


def pcm16_to_float32(pcm_bytes: bytes) -> np.ndarray:
    """Convert PCM16 bytes to float32 numpy array normalized to [-1, 1]."""
    if len(pcm_bytes) % 2 != 0:
        pcm_bytes = pcm_bytes[:-1]
    arr = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
    return arr / 32767.0


def float32_to_pcm16(float_arr: np.ndarray) -> bytes:
    """Convert float32 numpy array [-1, 1] to PCM16 bytes."""
    clipped = np.clip(float_arr, -1.0, 1.0)
    pcm16 = (clipped * 32767).astype(np.int16)
    return pcm16.tobytes()


def resample_audio(
    audio: np.ndarray,
    orig_sr: int,
    target_sr: int = SAMPLE_RATE,
) -> np.ndarray:
    """Resample audio using scipy.signal.resample_poly."""
    if orig_sr == target_sr:
        return audio
    gcd = np.gcd(orig_sr, target_sr)
    up = target_sr // gcd
    down = orig_sr // gcd
    return signal.resample_poly(audio, up, down).astype(np.float32)


def mulaw_encode(pcm16_bytes: bytes) -> bytes:
    """Encode PCM16 to μ-law (G.711)."""
    pcm16 = np.frombuffer(pcm16_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    mu = 255.0
    sign = np.sign(pcm16)
    magnitude = np.log1p(mu * np.abs(pcm16)) / np.log1p(mu)
    mulaw = sign * magnitude * 127.0
    biased = (mulaw + 128).astype(np.int16)
    encoded = np.bitwise_xor(biased, 127).astype(np.uint8)
    return encoded.tobytes()


def mulaw_decode(mulaw_bytes: bytes) -> bytes:
    """Decode μ-law (G.711) to PCM16."""
    mulaw = np.frombuffer(mulaw_bytes, dtype=np.uint8).astype(np.int16)
    # Unbias
    mulaw = np.bitwise_xor(mulaw, 127) - 128
    sign = np.sign(mulaw.astype(np.float32))
    magnitude = np.abs(mulaw.astype(np.float32)) / 127.0
    mu = 255.0
    pcm = sign * (np.exp(magnitude * np.log1p(mu)) - 1) / mu
    pcm16 = np.clip(pcm * 32767, -32768, 32767).astype(np.int16)
    return pcm16.tobytes()


def alaw_encode(pcm16_bytes: bytes) -> bytes:
    """Encode PCM16 to A-law (G.711)."""
    pcm16 = np.frombuffer(pcm16_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    A = 87.6
    sign = np.sign(pcm16)
    magnitude = np.abs(pcm16)
    compressed = np.where(
        magnitude < 1 / A,
        sign * A * magnitude / (1 + np.log(A)),
        sign * (1 + np.log(A * magnitude)) / (1 + np.log(A)),
    )
    encoded = ((compressed + 1) * 127.5).astype(np.uint8)
    return encoded.tobytes()


def alaw_decode(alaw_bytes: bytes) -> bytes:
    """Decode A-law (G.711) to PCM16."""
    alaw = np.frombuffer(alaw_bytes, dtype=np.uint8).astype(np.float32) / 127.5 - 1
    A = 87.6
    sign = np.sign(alaw)
    magnitude = np.abs(alaw)
    pcm = np.where(
        magnitude < 1 / (1 + np.log(A)),
        sign * magnitude * (1 + np.log(A)) / A,
        sign * (np.exp(magnitude * (1 + np.log(A)) - 1) / A),
    )
    pcm16 = np.clip(pcm * 32767, -32768, 32767).astype(np.int16)
    return pcm16.tobytes()


def pcm16_to_wav(pcm16_bytes: bytes, sample_rate: int = SAMPLE_RATE, channels: int = CHANNELS) -> bytes:
    """Wrap PCM16 bytes in a WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16_bytes)
    return buf.getvalue()


def get_audio_chunk_size(sample_rate: int = SAMPLE_RATE, chunk_ms: int = CHUNK_MS, channels: int = CHANNELS) -> int:
    """Get expected byte size for one audio chunk."""
    samples = int(sample_rate * chunk_ms / 1000)
    return samples * channels * 2


def split_pcm16_chunks(pcm16_bytes: bytes, chunk_size: int = FRAME_SIZE) -> list[bytes]:
    """Split PCM16 bytes into fixed-size chunks."""
    return [pcm16_bytes[i : i + chunk_size] for i in range(0, len(pcm16_bytes), chunk_size)]
