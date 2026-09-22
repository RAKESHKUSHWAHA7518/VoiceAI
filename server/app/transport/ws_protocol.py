from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from enum import IntEnum
from typing import Any


class FrameType(IntEnum):
    """WebSocket frame type markers (first byte of binary frame)."""
    AUDIO = 0x01
    CONTROL = 0x02
    PING = 0x03
    PONG = 0x04


class ControlType(str):
    """Control frame payload types."""
    START_SPEAKING = "start_speaking"
    STOP_SPEAKING = "stop_speaking"
    INTERRUPT = "interrupt"
    FLUSH_BUFFER = "flush_buffer"
    PING = "ping"
    PONG = "pong"
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    ERROR = "error"
    CONFIG_UPDATE = "config_update"
    TRANSCRIPT = "transcript"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"


@dataclass(slots=True)
class ControlFrame:
    type: str
    payload: dict[str, Any]
    sequence: int = 0

    def to_bytes(self) -> bytes:
        payload_dict = {"type": self.type, **self.payload}
        payload_bytes = json.dumps(payload_dict, separators=(",", ":")).encode("utf-8")
        header = struct.pack(">BHI", FrameType.CONTROL, self.sequence, len(payload_bytes))
        return header + payload_bytes

    @classmethod
    def from_bytes(cls, data: bytes) -> ControlFrame | None:
        if len(data) < 7:
            return None
        frame_type, sequence, payload_len = struct.unpack(">BHI", data[:7])
        if frame_type != FrameType.CONTROL:
            return None
        if len(data) < 7 + payload_len:
            return None
        payload = json.loads(data[7 : 7 + payload_len].decode("utf-8"))
        return cls(type=payload.get("type", ""), payload=payload, sequence=sequence)


def create_audio_frame(audio_bytes: bytes, sequence: int = 0) -> bytes:
    """Create binary audio frame with type + sequence + length header."""
    header = struct.pack(">BHI", FrameType.AUDIO, sequence, len(audio_bytes))
    return header + audio_bytes


def parse_audio_frame(data: bytes) -> tuple[int, bytes] | None:
    """Parse binary audio frame, return (sequence, audio_bytes) or None."""
    if len(data) < 7:
        return None
    frame_type, sequence, payload_len = struct.unpack(">BHI", data[:7])
    if frame_type != FrameType.AUDIO:
        return None
    if len(data) < 7 + payload_len:
        return None
    return sequence, data[7 : 7 + payload_len]


def create_control_frame(control_type: str, payload: dict[str, Any], sequence: int = 0) -> bytes:
    """Create a control frame."""
    return ControlFrame(type=control_type, payload=payload, sequence=sequence).to_bytes()


def create_ping_frame(sequence: int = 0) -> bytes:
    """Create a ping frame."""
    return struct.pack(">BHI", FrameType.PING, sequence, 0)


def create_pong_frame(sequence: int = 0) -> bytes:
    """Create a pong frame."""
    return struct.pack(">BHI", FrameType.PONG, sequence, 0)


def parse_frame(data: bytes) -> tuple[FrameType, int, bytes] | None:
    """Parse any frame, return (frame_type, sequence, payload) or None."""
    if len(data) < 7:
        return None
    frame_type, sequence, payload_len = struct.unpack(">BHI", data[:7])
    if len(data) < 7 + payload_len:
        return None
    return FrameType(frame_type), sequence, data[7 : 7 + payload_len]
