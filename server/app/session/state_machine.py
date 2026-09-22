from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from server.app.memory import MemoryManager, SlidingWindowMemory


class SessionState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    INTERRUPTED = "interrupted"
    ENDED = "ended"


@dataclass(slots=True)
class TurnContext:
    turn_id: str
    user_transcript: str = ""
    interim_transcript: str = ""
    llm_tokens: list[str] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    tool_results: list[dict[str, Any]] = field(default_factory=list)
    tts_chunks_sent: int = 0
    cancelled: bool = False
    interrupted: bool = False
    interrupted_at_token: int = 0
    preserved_context: str = ""  # Context preserved from interrupted turn
    start_time: float = field(default_factory=time.time)
    end_time: float | None = None


class SessionStateMachine:
    """Manages session lifecycle with memory integration and time-travel rewind."""

    def __init__(
        self, 
        session_id: str,
        user_id: str = "anonymous",
        memory_manager: Optional[MemoryManager] = None,
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.state = SessionState.IDLE
        self.current_turn: TurnContext | None = None
        self.turn_history: list[TurnContext] = []
        self._turn_counter = 0
        self._cancellation_event: asyncio.Event | None = None

        # Memory integration
        self.memory = memory_manager or MemoryManager(user_id=user_id)
        self.memory.short_term.set_llm = lambda llm: None  # Will be set by pipeline

        # Interruption tracking
        self.last_interruption_time: float = 0
        self.interruption_count: int = 0

    def set_llm(self, llm) -> None:
        """Set LLM for background summarization."""
        self.memory.short_term._llm = llm

    def start_session(self) -> None:
        self.state = SessionState.LISTENING
        # Inject long-term memory context at session start
        long_context = self.memory.long_term.get_context_for_session()
        if long_context:
            self.memory.short_term.add("system", f"[Long-term context] {long_context}")

    def end_session(self) -> None:
        self.state = SessionState.ENDED
        if self.current_turn:
            self.current_turn.cancelled = True
            self.current_turn.end_time = time.time()
        if self._cancellation_event:
            self._cancellation_event.set()
        
        # Persist session summary to long-term memory
        self.memory.end_session()

    def new_turn(self, turn_id: str | None = None) -> TurnContext:
        self._turn_counter += 1
        tid = turn_id or f"turn_{self._turn_counter}"
        self.current_turn = TurnContext(turn_id=tid, start_time=time.time())
        self.turn_history.append(self.current_turn)
        self.state = SessionState.PROCESSING
        self._cancellation_event = asyncio.Event()
        
        # Add to short-term memory
        if self.current_turn:
            self.memory.short_term.add("system", f"[Turn started: {tid}]", turn_id=tid)
        
        return self.current_turn

    def start_listening(self) -> None:
        self.state = SessionState.LISTENING

    def start_speaking(self) -> None:
        self.state = SessionState.SPEAKING

    def interrupt(self) -> None:
        """Signal barge-in interruption with context preservation."""
        self.state = SessionState.INTERRUPTED
        self.last_interruption_time = time.time()
        self.interruption_count += 1
        
        if self.current_turn:
            self.current_turn.cancelled = True
            self.current_turn.interrupted = True
            self.current_turn.end_time = time.time()
            # Preserve context
            self.current_turn.preserved_context = self.current_turn.user_transcript
            if self.current_turn.llm_tokens:
                self.current_turn.interrupted_at_token = len(self.current_turn.llm_tokens)
                self.current_turn.preserved_context += " | " + "".join(
                    self.current_turn.llm_tokens[:self.current_turn.interrupted_at_token]
                )
            
            # Add to memory as interrupted turn
            self.memory.short_term.add(
                "system", 
                f"[Interrupted] {self.current_turn.preserved_context}",
                turn_id=self.current_turn.turn_id,
            )
        
        if self._cancellation_event:
            self._cancellation_event.set()

    def resume_after_interrupt(self) -> None:
        self.state = SessionState.LISTENING
        self._cancellation_event = asyncio.Event()

    def get_preserved_context(self) -> str:
        """Get preserved context from last interrupted turn for context injection."""
        if self.turn_history and self.turn_history[-1].preserved_context:
            return self.turn_history[-1].preserved_context
        return ""

    @property
    def is_cancelled(self) -> bool:
        return self._cancellation_event is not None and self._cancellation_event.is_set()

    async def wait_for_cancellation(self, timeout: float | None = None) -> bool:
        """Wait for cancellation signal. Returns True if cancelled."""
        if self._cancellation_event is None:
            return False
        try:
            await asyncio.wait_for(self._cancellation_event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    def get_context_for_rewind(self, turn_index: int) -> TurnContext | None:
        """Get turn context for time-travel rewind."""
        if 0 <= turn_index < len(self.turn_history):
            return self.turn_history[turn_index]
        return None

    def get_recent_context(self, num_turns: int = 3) -> str:
        """Get recent conversation context for LLM (including interrupted turns)."""
        context_parts = []
        for turn in self.turn_history[-num_turns:]:
            if turn.user_transcript:
                context_parts.append(f"User: {turn.user_transcript}")
            if turn.preserved_context and turn.interrupted:
                context_parts.append(f"[Interrupted] {turn.preserved_context}")
        return "\n".join(context_parts)

    def rewind_to_turn(self, turn_id: str) -> list[TurnContext]:
        """
        Time-travel rewind: restore memory state to a specific turn.
        Returns the rewound turn history.
        """
        # Find the turn
        target_index = -1
        for i, turn in enumerate(self.turn_history):
            if turn.turn_id == turn_id:
                target_index = i
                break
        
        if target_index == -1:
            return []
        
        # Rewind turn history
        rewound_turns = self.turn_history[:target_index + 1]
        self.turn_history = rewound_turns
        self._turn_counter = target_index
        self.current_turn = self.turn_history[-1] if self.turn_history else None
        
        # Rewind short-term memory
        memory_entries = self.memory.short_term.rewind_to_turn(turn_id)
        
        # Rebuild short-term memory from rewound entries
        self.memory.short_term.entries.clear()
        for entry in memory_entries:
            self.memory.short_term.entries.append(entry)
        
        return self.turn_history

    def get_full_history(self) -> list[TurnContext]:
        """Get complete turn history for debugging/inspection."""
        return self.turn_history.copy()

    def get_memory_stats(self) -> dict:
        """Get memory statistics for monitoring."""
        return {
            "short_term_entries": len(self.memory.short_term.entries),
            "short_term_tokens": self.memory.short_term.get_token_count(),
            "has_summary": bool(self.memory.short_term.summarized_context),
            "long_term_profile_keys": list(self.memory.long_term.profile.keys()),
            "long_term_preferences": list(self.memory.long_term.preferences.keys()),
            "session_summaries": len(self.memory.long_term.session_summaries),
        }