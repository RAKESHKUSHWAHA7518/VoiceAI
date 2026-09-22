from __future__ import annotations

import time

from server.app.telemetry.latency_spans import LatencyContext, LatencyTracker


def test_latency_tracker_basic():
    tracker = LatencyTracker("test_turn", "test_session")

    with tracker.span("vad") as span:
        time.sleep(0.01)
    assert "vad" in tracker.spans
    assert tracker.spans["vad"].duration_ms is not None
    assert tracker.spans["vad"].duration_ms >= 10

    with tracker.span("asr", model="deepgram"):
        time.sleep(0.01)

    metrics = tracker.get_metrics()
    assert metrics.vad_ms > 0
    assert metrics.asr_ms > 0


def test_latency_context():
    LatencyContext.clear()

    with LatencyContext.turn("turn_1") as tracker:
        assert LatencyContext.get_current() is tracker
        with tracker.span("test"):
            pass

    assert LatencyContext.get_current() is None


def test_nested_turns():
    LatencyContext.clear()

    with LatencyContext.turn("outer") as outer:
        with outer.span("outer_span"):
            pass
        with LatencyContext.turn("inner") as inner:
            with inner.span("inner_span"):
                pass
            assert LatencyContext.get_current() is inner
        assert LatencyContext.get_current() is outer
