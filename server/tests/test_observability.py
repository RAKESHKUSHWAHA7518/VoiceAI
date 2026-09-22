from __future__ import annotations

import asyncio
import time

from server.app.telemetry.latency_spans import (
    LatencyTracker,
    TurnMetrics,
    StageNames,
    MetricsCollector,
    get_metrics_collector,
)
from server.app.telemetry.evaluation import (
    SentimentLabel,
    SentimentResult,
    GoalCompletionResult,
    ConversationTrajectory,
    CallEvaluation,
)


def test_latency_tracker_basic():
    """Test basic latency tracker functionality."""
    tracker = LatencyTracker("test_turn", "test_session")
    
    with tracker.span("vad"):
        time.sleep(0.01)
    
    with tracker.span("asr"):
        time.sleep(0.01)
    
    tracker.mark_ttft()
    time.sleep(0.01)
    tracker.mark_tts_first_chunk()
    
    metrics = tracker.get_metrics()
    
    assert metrics.turn_id == "test_turn"
    assert metrics.session_id == "test_session"
    assert metrics.vad_ms > 0
    assert metrics.asr_ms > 0
    assert metrics.ttft_ms > 0
    assert metrics.tts_first_chunk_ms > 0
    assert metrics.e2e_ms > 0


def test_latency_tracker_interruptions():
    """Test interruption recording."""
    tracker = LatencyTracker("test_turn", "test_session")
    
    tracker.record_interruption()
    tracker.record_interruption()
    
    metrics = tracker.get_metrics()
    assert metrics.interruption_count == 2


def test_turn_metrics_to_dict():
    """Test TurnMetrics serialization."""
    metrics = TurnMetrics(
        turn_id="t1",
        session_id="s1",
        vad_ms=10.5,
        asr_ms=150.2,
        ttft_ms=200.7,
        tts_first_chunk_ms=120.3,
        e2e_ms=480.1,
        tool_exec_ms=500.0,
        tts_streaming_ms=300.0,
        interruption_count=1,
        metadata={"custom": "data"},
    )
    
    d = metrics.to_dict()
    
    assert d["turn_id"] == "t1"
    assert d["session_id"] == "s1"
    assert d["vad_ms"] == 10.5
    assert d["asr_ms"] == 150.2
    assert d["ttft_ms"] == 200.7
    assert d["tts_first_chunk_ms"] == 120.3
    assert d["e2e_ms"] == 480.1
    assert d["tool_exec_ms"] == 500.0
    assert d["tts_streaming_ms"] == 300.0
    assert d["interruption_count"] == 1
    assert d["metadata"]["custom"] == "data"


async def test_metrics_collector():
    """Test metrics collector aggregation."""
    collector = MetricsCollector()
    
    # Record some turns
    for i in range(10):
        metrics = TurnMetrics(
            turn_id=f"t{i}",
            session_id="s1",
            vad_ms=10.0 + i,
            asr_ms=150.0 + i,
            ttft_ms=200.0 + i,
            tts_first_chunk_ms=100.0 + i,
            e2e_ms=500.0 + i * 10,
            interruption_count=i % 2,
        )
        await collector.record(metrics)
    
    # Get percentiles
    percentiles = await collector.get_percentiles(window=10)
    
    assert "vad_p50" in percentiles
    assert "vad_p95" in percentiles
    assert "asr_p50" in percentiles
    assert "asr_p95" in percentiles
    assert "ttft_p50" in percentiles
    assert "ttft_p95" in percentiles
    assert "e2e_p50" in percentiles
    assert "e2e_p95" in percentiles
    assert "interruption_rate" in percentiles
    
    # Verify percentile values are reasonable
    assert 10 <= percentiles["vad_p50"] <= 20
    assert percentiles["interruption_rate"] == 0.5  # 5 out of 10


async def test_metrics_collector_recent():
    """Test getting recent turns."""
    collector = MetricsCollector()
    
    for i in range(15):
        metrics = TurnMetrics(
            turn_id=f"t{i}",
            session_id="s1",
            e2e_ms=100.0 + i,
        )
        await collector.record(metrics)
    
    recent = await collector.get_recent_turns(limit=5)
    
    assert len(recent) == 5
    assert recent[-1]["turn_id"] == "t14"
    assert recent[0]["turn_id"] == "t10"


def test_sentiment_result():
    """Test SentimentResult dataclass."""
    result = SentimentResult(
        label=SentimentLabel.POSITIVE,
        score=0.8,
        confidence=0.9,
        reasoning="User seems happy",
    )
    
    assert result.label == SentimentLabel.POSITIVE
    assert result.score == 0.8
    assert result.confidence == 0.9


def test_goal_completion_result():
    """Test GoalCompletionResult dataclass."""
    result = GoalCompletionResult(
        completed=True,
        confidence=0.9,
        reasoning="User booked appointment",
        completed_goals=["book_appointment"],
        incomplete_goals=[],
    )
    
    assert result.completed is True
    assert result.confidence == 0.9
    assert "book_appointment" in result.completed_goals


def test_conversation_trajectory():
    """Test ConversationTrajectory tracking."""
    traj = ConversationTrajectory()
    
    traj.add_turn("t1", SentimentResult(SentimentLabel.POSITIVE, 0.5, 0.8), 0.8)
    traj.add_turn("t2", SentimentResult(SentimentLabel.NEUTRAL, 0.0, 0.7), 0.6)
    traj.add_turn("t3", SentimentResult(SentimentLabel.NEGATIVE, -0.3, 0.6), 0.4)
    
    summary = traj.get_trajectory_summary()
    
    assert summary["turn_count"] == 3
    assert abs(summary["avg_sentiment"] - 0.067) < 0.01  # (0.5 + 0 - 0.3) / 3
    assert summary["sentiment_trend"] == "declining"
    assert abs(summary["avg_engagement"] - 0.6) < 0.01


def test_call_evaluation():
    """Test CallEvaluation dataclass."""
    eval = CallEvaluation(
        call_id="call_1",
        session_id="sess_1",
        start_time=time.time() - 300,
        end_time=time.time(),
        duration_seconds=300,
        avg_vad_ms=10.0,
        avg_asr_ms=150.0,
        avg_ttft_ms=200.0,
        avg_tts_first_chunk_ms=100.0,
        avg_e2e_ms=450.0,
        p95_e2e_ms=600.0,
        total_turns=10,
        total_interruptions=2,
        interruption_rate=0.2,
        tool_calls_count=3,
        tool_success_rate=1.0,
        overall_score=85.0,
    )
    
    d = eval.to_dict()
    
    assert d["call_id"] == "call_1"
    assert d["session_id"] == "sess_1"
    assert d["duration_seconds"] == 300
    assert d["avg_vad_ms"] == 10.0
    assert d["overall_score"] == 85.0


async def test_percentile_calculation():
    """Test percentile helper function."""
    from server.app.telemetry.evaluation import percentile
    
    data = list(range(100))  # 0-99
    
    # Implementation uses idx = int(len * p / 100), so:
    # p=50 -> idx=50 -> value 50
    # p=95 -> idx=95 -> value 95
    # p=99 -> idx=99 -> value 99
    assert percentile(data, 50) == 50
    assert percentile(data, 95) == 95
    assert percentile(data, 99) == 99
    
    # Empty data
    assert percentile([], 50) == 0.0


if __name__ == "__main__":
    test_latency_tracker_basic()
    print("✓ test_latency_tracker_basic")
    
    test_latency_tracker_interruptions()
    print("✓ test_latency_tracker_interruptions")
    
    test_turn_metrics_to_dict()
    print("✓ test_turn_metrics_to_dict")
    
    test_sentiment_result()
    print("✓ test_sentiment_result")
    
    test_goal_completion_result()
    print("✓ test_goal_completion_result")
    
    test_conversation_trajectory()
    print("✓ test_conversation_trajectory")
    
    test_call_evaluation()
    print("✓ test_call_evaluation")
    
    test_percentile_calculation()
    print("✓ test_percentile_calculation")
    
    asyncio.run(test_metrics_collector())
    print("✓ test_metrics_collector")
    
    asyncio.run(test_metrics_collector_recent())
    print("✓ test_metrics_collector_recent")
    
    print("\nAll observability tests passed!")