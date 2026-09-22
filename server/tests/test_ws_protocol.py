from __future__ import annotations

from server.app.transport.ws_protocol import (
    ControlFrame,
    FrameType,
    create_audio_frame,
    create_control_frame,
    create_ping_frame,
    create_pong_frame,
    parse_audio_frame,
    parse_frame,
)


class TestWSProtocol:
    def test_create_audio_frame(self):
        audio = b"\x00\x00" * 480
        frame = create_audio_frame(audio, sequence=5)
        assert frame[0] == FrameType.AUDIO
        assert len(frame) == 7 + len(audio)

    def test_parse_audio_frame(self):
        audio = b"\x00\x00" * 480
        frame = create_audio_frame(audio, sequence=7)
        parsed = parse_audio_frame(frame)
        assert parsed is not None
        seq, payload = parsed
        assert seq == 7
        assert payload == audio

    def test_parse_audio_frame_invalid_type(self):
        # Create a control frame, try to parse as audio
        control = create_control_frame("ping", {}, sequence=1)
        parsed = parse_audio_frame(control)
        assert parsed is None

    def test_create_control_frame(self):
        frame = create_control_frame("start_speaking", {"session_id": "abc"}, sequence=3)
        assert frame[0] == FrameType.CONTROL

    def test_parse_control_frame(self):
        frame = create_control_frame("stop_speaking", {"reason": "eos"}, sequence=2)
        parsed = ControlFrame.from_bytes(frame)
        assert parsed is not None
        assert parsed.type == "stop_speaking"
        assert parsed.payload == {"type": "stop_speaking", "reason": "eos"}
        assert parsed.sequence == 2

    def test_create_ping_pong(self):
        ping = create_ping_frame(10)
        pong = create_pong_frame(10)
        assert ping[0] == FrameType.PING
        assert pong[0] == FrameType.PONG
        assert len(ping) == 7
        assert len(pong) == 7

    def test_parse_frame(self):
        audio = create_audio_frame(b"audio", 1)
        parsed = parse_frame(audio)
        assert parsed is not None
        ftype, seq, payload = parsed
        assert ftype == FrameType.AUDIO
        assert seq == 1
        assert payload == b"audio"

        control = create_control_frame("ping", {}, 2)
        parsed = parse_frame(control)
        assert parsed is not None
        ftype, seq, payload = parsed
        assert ftype == FrameType.CONTROL
        assert seq == 2

    def test_frame_too_short(self):
        assert parse_frame(b"") is None
        assert parse_frame(b"\x01") is None
        assert parse_frame(b"\x01\x00\x00\x00\x01") is None
