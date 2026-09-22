from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from server.app.llm import StreamingLLM
from server.app.telemetry.latency_spans import TurnMetrics, get_metrics_collector
from server.app.config import settings


class SentimentLabel(str, Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


@dataclass(slots=True)
class SentimentResult:
    label: SentimentLabel
    score: float  # -1 to 1
    confidence: float
    reasoning: str = ""


@dataclass(slots=True)
class GoalCompletionResult:
    completed: bool
    confidence: float
    reasoning: str = ""
    completed_goals: list[str] = field(default_factory=list)
    incomplete_goals: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ConversationTrajectory:
    """Tracks sentiment and engagement over conversation turns."""
    turns: list[dict] = field(default_factory=list)  # {turn_id, sentiment, engagement, timestamp}
    
    def add_turn(self, turn_id: str, sentiment: SentimentResult, engagement: float) -> None:
        self.turns.append({
            "turn_id": turn_id,
            "sentiment_label": sentiment.label.value,
            "sentiment_score": sentiment.score,
            "engagement": engagement,
            "timestamp": time.time(),
        })
    
    def get_trajectory_summary(self) -> dict[str, Any]:
        if not self.turns:
            return {}
        
        scores = [t["sentiment_score"] for t in self.turns]
        engagements = [t["engagement"] for t in self.turns]
        
        return {
            "avg_sentiment": sum(scores) / len(scores),
            "sentiment_trend": "improving" if scores[-1] > scores[0] else "declining" if scores[-1] < scores[0] else "stable",
            "avg_engagement": sum(engagements) / len(engagements),
            "turn_count": len(self.turns),
        }


@dataclass(slots=True)
class CallEvaluation:
    """Complete post-call evaluation result."""
    call_id: str
    session_id: str
    start_time: float
    end_time: float
    duration_seconds: float
    
    # Latency metrics (from TurnMetrics aggregation)
    avg_vad_ms: float = 0.0
    avg_asr_ms: float = 0.0
    avg_ttft_ms: float = 0.0
    avg_tts_first_chunk_ms: float = 0.0
    avg_e2e_ms: float = 0.0
    p95_e2e_ms: float = 0.0
    
    # Quality metrics
    sentiment: Optional[SentimentResult] = None
    goal_completion: Optional[GoalCompletionResult] = None
    trajectory: Optional[ConversationTrajectory] = None
    
    # Interaction metrics
    total_turns: int = 0
    total_interruptions: int = 0
    interruption_rate: float = 0.0
    tool_calls_count: int = 0
    tool_success_rate: float = 0.0
    
    # Scoring
    overall_score: float = 0.0  # 0-100
    
    # Metadata
    metadata: dict[str, Any] = field(default_factory=dict)
    evaluated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "call_id": self.call_id,
            "session_id": self.session_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_seconds": self.duration_seconds,
            "avg_vad_ms": round(self.avg_vad_ms, 2),
            "avg_asr_ms": round(self.avg_asr_ms, 2),
            "avg_ttft_ms": round(self.avg_ttft_ms, 2),
            "avg_tts_first_chunk_ms": round(self.avg_tts_first_chunk_ms, 2),
            "avg_e2e_ms": round(self.avg_e2e_ms, 2),
            "p95_e2e_ms": round(self.p95_e2e_ms, 2),
            "sentiment": {
                "label": self.sentiment.label.value if self.sentiment else None,
                "score": self.sentiment.score if self.sentiment else None,
                "confidence": self.sentiment.confidence if self.sentiment else None,
            } if self.sentiment else None,
            "goal_completion": {
                "completed": self.goal_completion.completed if self.goal_completion else None,
                "confidence": self.goal_completion.confidence if self.goal_completion else None,
                "completed_goals": self.goal_completion.completed_goals if self.goal_completion else [],
                "incomplete_goals": self.goal_completion.incomplete_goals if self.goal_completion else [],
            } if self.goal_completion else None,
            "trajectory": self.trajectory.get_trajectory_summary() if self.trajectory else None,
            "total_turns": self.total_turns,
            "total_interruptions": self.total_interruptions,
            "interruption_rate": round(self.interruption_rate, 3),
            "tool_calls_count": self.tool_calls_count,
            "tool_success_rate": round(self.tool_success_rate, 3),
            "overall_score": round(self.overall_score, 1),
            "evaluated_at": self.evaluated_at,
            **self.metadata,
        }


class SentimentAnalyzer:
    """Analyzes sentiment of conversation text using LLM."""
    
    def __init__(self, llm: Optional[StreamingLLM] = None):
        self.llm = llm or StreamingLLM()
        self._prompt = """Analyze the sentiment of this conversation turn.
Return JSON only:
{
  "label": "positive|neutral|negative",
  "score": -1.0 to 1.0,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

Conversation turn: {text}"""

    async def analyze(self, text: str) -> SentimentResult:
        if not text.strip():
            return SentimentResult(
                label=SentimentLabel.NEUTRAL,
                score=0.0,
                confidence=0.5,
                reasoning="Empty text",
            )
        
        try:
            # Use low temperature for consistent analysis
            orig_temp = self.llm.temperature
            self.llm.temperature = 0.1
            
            prompt = self._prompt.format(text=text[:2000])
            response_parts = []
            async for token in self.llm.stream_chat([], prompt, tools=None):
                if token.text:
                    response_parts.append(token.text)
            
            self.llm.temperature = orig_temp
            
            response = "".join(response_parts).strip()
            data = json.loads(response)
            
            return SentimentResult(
                label=SentimentLabel(data.get("label", "neutral")),
                score=float(data.get("score", 0.0)),
                confidence=float(data.get("confidence", 0.5)),
                reasoning=data.get("reasoning", ""),
            )
        except Exception:
            return SentimentResult(
                label=SentimentLabel.NEUTRAL,
                score=0.0,
                confidence=0.3,
                reasoning="Analysis failed",
            )


class GoalCompletionEvaluator:
    """Evaluates whether conversation goals were completed."""
    
    def __init__(self, llm: Optional[StreamingLLM] = None):
        self.llm = llm or StreamingLLM()
        self._prompt = """Evaluate if the user's goals were completed in this conversation.
Conversation transcript:
{transcript}

Known goals (if any): {goals}

Return JSON only:
{
  "completed": true/false,
  "confidence": 0.0 to 1.0,
  "reasoning": "explanation",
  "completed_goals": ["goal1", "goal2"],
  "incomplete_goals": ["goal3"]
}"""

    async def evaluate(
        self,
        transcript: str,
        goals: list[str] = None,
    ) -> GoalCompletionResult:
        if not transcript.strip():
            return GoalCompletionResult(
                completed=False,
                confidence=0.5,
                reasoning="Empty transcript",
            )
        
        try:
            orig_temp = self.llm.temperature
            self.llm.temperature = 0.1
            
            prompt = self._prompt.format(
                transcript=transcript[:4000],
                goals=json.dumps(goals or []),
            )
            response_parts = []
            async for token in self.llm.stream_chat([], prompt, tools=None):
                if token.text:
                    response_parts.append(token.text)
            
            self.llm.temperature = orig_temp
            
            response = "".join(response_parts).strip()
            data = json.loads(response)
            
            return GoalCompletionResult(
                completed=bool(data.get("completed", False)),
                confidence=float(data.get("confidence", 0.5)),
                reasoning=data.get("reasoning", ""),
                completed_goals=data.get("completed_goals", []),
                incomplete_goals=data.get("incomplete_goals", []),
            )
        except Exception:
            return GoalCompletionResult(
                completed=False,
                confidence=0.3,
                reasoning="Evaluation failed",
            )


class CallEvaluator:
    """Orchestrates complete post-call evaluation."""
    
    def __init__(
        self,
        sentiment_analyzer: Optional[SentimentAnalyzer] = None,
        goal_evaluator: Optional[GoalCompletionEvaluator] = None,
        llm: Optional[StreamingLLM] = None,
    ):
        self.llm = llm or StreamingLLM()
        self.sentiment_analyzer = sentiment_analyzer or SentimentAnalyzer(self.llm)
        self.goal_evaluator = goal_evaluator or GoalCompletionEvaluator(self.llm)
        self.metrics_collector = get_metrics_collector()
    
    async def evaluate_call(
        self,
        call_id: str,
        session_id: str,
        transcript: str,
        turn_metrics: list[dict],
        goals: list[str] = None,
    ) -> CallEvaluation:
        """Run complete post-call evaluation."""
        start_time = time.time()
        
        # Aggregate latency metrics
        if turn_metrics:
            latencies = [t for t in turn_metrics if t.get("e2e_ms")]
            e2e_latencies = [t["e2e_ms"] for t in latencies]
            vad_latencies = [t["vad_ms"] for t in latencies]
            asr_latencies = [t["asr_ms"] for t in latencies]
            ttft_latencies = [t["ttft_ms"] for t in latencies]
            tts_first_latencies = [t["tts_first_chunk_ms"] for t in latencies]
            
            def percentile(data: list[float], p: float) -> float:
                if not data:
                    return 0.0
                sorted_data = sorted(data)
                idx = int(len(sorted_data) * p / 100)
                return sorted_data[min(idx, len(sorted_data) - 1)]
            
            avg_vad = sum(vad_latencies) / len(vad_latencies) if vad_latencies else 0
            avg_asr = sum(asr_latencies) / len(asr_latencies) if asr_latencies else 0
            avg_ttft = sum(ttft_latencies) / len(ttft_latencies) if ttft_latencies else 0
            avg_tts = sum(tts_first_latencies) / len(tts_first_latencies) if tts_first_latencies else 0
            avg_e2e = sum(e2e_latencies) / len(e2e_latencies) if e2e_latencies else 0
            p95_e2e = percentile(e2e_latencies, 95)
        else:
            avg_vad = avg_asr = avg_ttft = avg_tts = avg_e2e = p95_e2e = 0
        
        # Run sentiment analysis on full transcript
        sentiment = await self.sentiment_analyzer.analyze(transcript)
        
        # Evaluate goal completion
        goal_completion = await self.goal_evaluator.evaluate(transcript, goals)
        
        # Build trajectory from turn metrics
        trajectory = ConversationTrajectory()
        for i, turn in enumerate(turn_metrics):
            # Simple engagement heuristic: inverse of latency
            engagement = 1.0 / (1.0 + turn.get("e2e_ms", 100) / 1000)
            turn_sentiment = await self.sentiment_analyzer.analyze(
                turn.get("user_transcript", "")
            )
            trajectory.add_turn(f"turn_{i}", turn_sentiment, engagement)
        
        # Calculate interaction metrics
        total_interruptions = sum(t.get("interruption_count", 0) for t in turn_metrics)
        total_tool_calls = sum(1 for t in turn_metrics if t.get("tool_calls"))
        successful_tool_calls = sum(
            1 for t in turn_metrics 
            if t.get("tool_calls") and not t.get("tool_fallback", False)
        )
        
        # Calculate overall score (0-100)
        score_components = {
            "latency": max(0, 100 - (avg_e2e / 10)),  # Penalize >1000ms
            "sentiment": (sentiment.score + 1) * 25 if sentiment else 25,
            "goals": 100 if goal_completion.completed else 25,
            "interruptions": max(0, 100 - sum(t.get("interruption_count", 0) for t in turn_metrics) * 20),
            "tool_success": tool_success_rate * 100 if (tool_success_rate := (successful_tool_calls / total_tool_calls if total_tool_calls else 1)) else 100,
        }
        overall_score = sum(score_components.values()) / len(score_components)
        
        return CallEvaluation(
            call_id=call_id,
            session_id=session_id,
            start_time=time.time() - sum(t.get("e2e_ms", 0) for t in turn_metrics) / 1000,
            end_time=time.time(),
            duration_seconds=sum(t.get("e2e_ms", 0) for t in turn_metrics) / 1000,
            avg_vad_ms=avg_vad,
            avg_asr_ms=avg_asr,
            avg_ttft_ms=avg_ttft,
            avg_tts_first_chunk_ms=avg_tts,
            avg_e2e_ms=avg_e2e,
            p95_e2e_ms=p95_e2e,
            sentiment=sentiment,
            goal_completion=goal_completion,
            trajectory=trajectory,
            total_turns=len(turn_metrics),
            total_interruptions=total_interruptions,
            interruption_rate=total_interruptions / len(turn_metrics) if turn_metrics else 0,
            tool_calls_count=total_tool_calls,
            tool_success_rate=successful_tool_calls / total_tool_calls if total_tool_calls else 1.0,
            overall_score=overall_score,
            metadata={"score_components": score_components},
        )
    
    async def save_evaluation(self, evaluation: CallEvaluation) -> None:
        """Save evaluation to storage (Langfuse, DB, etc.)."""
        # Could save to Langfuse, Postgres, etc.
        pass


# Helper for percentile calculation
def percentile(data: list[float], p: float) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    idx = int(len(sorted_data) * p / 100)
    return sorted_data[min(idx, len(sorted_data) - 1)]