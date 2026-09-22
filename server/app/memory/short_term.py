from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Optional

from server.app.config import settings
from server.app.llm import StreamingLLM


@dataclass(slots=True)
class MemoryEntry:
    """Single memory entry."""
    role: str  # user, assistant, system
    content: str
    timestamp: float = field(default_factory=time.time)
    tokens: int = 0
    turn_id: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class SlidingWindowMemory:
    """
    Sliding window short-term memory with background summarization.
    
    Keeps last N turns verbatim, summarizes older turns in background.
    """
    max_turns: int = 8
    max_tokens: int = 4000
    summarization_threshold: int = 10  # Trigger summarization after this many turns
    entries: deque = field(default_factory=lambda: deque(maxlen=16))
    summarized_context: str = ""
    summarization_task: Optional[asyncio.Task] = None
    _llm: Optional[StreamingLLM] = None
    
    def __post_init__(self):
        # Ensure maxlen is set correctly
        if self.entries.maxlen != self.max_turns * 2:
            self.entries = deque(self.entries, maxlen=self.max_turns * 2)
    
    def set_llm(self, llm: StreamingLLM) -> None:
        self._llm = llm
    
    def add(self, role: str, content: str, turn_id: str = "", tokens: int = 0, metadata: dict = None) -> None:
        """Add a new entry to memory."""
        entry = MemoryEntry(
            role=role,
            content=content,
            turn_id=turn_id,
            tokens=tokens or self._estimate_tokens(content),
            metadata=metadata or {},
        )
        self.entries.append(entry)
        
        # Trigger background summarization if needed
        if len(self.entries) >= self.summarization_threshold and self._llm:
            self._trigger_summarization()
    
    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimation (4 chars per token)."""
        return max(1, len(text) // 4)
    
    def _trigger_summarization(self) -> None:
        """Trigger background summarization of old entries."""
        if self.summarization_task and not self.summarization_task.done():
            return
        
        # Summarize entries beyond the sliding window
        if len(self.entries) > self.max_turns:
            self.summarization_task = asyncio.create_task(self._summarize_old_entries())
    
    async def _summarize_old_entries(self) -> None:
        """Summarize entries outside the sliding window."""
        if not self._llm or len(self.entries) <= self.max_turns:
            return
        
        # Get entries to summarize (all but last max_turns)
        to_summarize = list(self.entries)[:-self.max_turns]
        if not to_summarize:
            return
        
        # Build conversation text
        conv_text = "\n".join(
            f"{e.role}: {e.content}" for e in to_summarize
        )
        
        try:
            # Use low-temperature LLM for summarization
            orig_temp = self._llm.temperature
            self._llm.temperature = 0.1
            
            summary_prompt = f"""Summarize this conversation concisely, preserving key facts, decisions, and entities:
{conv_text}

Summary:"""
            
            summary_parts = []
            async for token in self._llm.stream_chat([], summary_prompt, tools=None):
                if token.text:
                    summary_parts.append(token.text)
            
            self.summarized_context = "".join(summary_parts).strip()
            
            # Remove summarized entries from deque
            for _ in range(len(to_summarize)):
                if len(self.entries) > self.max_turns:
                    self.entries.popleft()
            
            self._llm.temperature = orig_temp
            
        except Exception:
            # Don't fail the main flow on summarization error
            pass
    
    def get_context(self, include_summary: bool = True) -> str:
        """Get formatted context for LLM."""
        parts = []
        
        if include_summary and self.summarized_context:
            parts.append(f"[Previous context summary: {self.summarized_context}]")
        
        for entry in self.entries:
            parts.append(f"{entry.role}: {entry.content}")
        
        return "\n".join(parts)
    
    def get_entries(self) -> list[MemoryEntry]:
        """Get all current entries."""
        return list(self.entries)
    
    def get_token_count(self) -> int:
        """Get total token count."""
        return sum(e.tokens for e in self.entries)
    
    def clear(self) -> None:
        """Clear all memory."""
        self.entries.clear()
        self.summarized_context = ""
    
    def rewind_to_turn(self, turn_id: str) -> list[MemoryEntry]:
        """Get entries up to and including a specific turn (all entries for that turn)."""
        result = []
        found_turn = False
        for entry in self.entries:
            # Check if we should stop BEFORE adding this entry
            if found_turn and entry.turn_id != turn_id:
                break
            result.append(entry)
            if entry.turn_id == turn_id:
                found_turn = True
        return result


@dataclass(slots=True)
class LongTermMemory:
    """
    Long-term memory persisted to Postgres.
    
    Stores user profiles, preferences, and cross-session history.
    """
    user_id: str
    profile: dict = field(default_factory=dict)
    preferences: dict = field(default_factory=dict)
    session_summaries: list[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    
    def update_profile(self, key: str, value: Any) -> None:
        self.profile[key] = value
        self.updated_at = time.time()
    
    def update_preference(self, key: str, value: Any) -> None:
        self.preferences[key] = value
        self.updated_at = time.time()
    
    def add_session_summary(self, summary: str) -> None:
        self.session_summaries.append(summary)
        # Keep last 20 summaries
        if len(self.session_summaries) > 20:
            self.session_summaries = self.session_summaries[-20:]
        self.updated_at = time.time()
    
    def get_context_for_session(self) -> str:
        """Get context to inject at session start."""
        parts = []
        
        if self.profile:
            profile_str = ", ".join(f"{k}: {v}" for k, v in self.profile.items())
            parts.append(f"User profile: {profile_str}")
        
        if self.preferences:
            pref_str = ", ".join(f"{k}: {v}" for k, v in self.preferences.items())
            parts.append(f"Preferences: {pref_str}")
        
        if self.session_summaries:
            parts.append(f"Recent sessions: {'; '.join(self.session_summaries[-3:])}")
        
        return "\n".join(parts)


class MemoryManager:
    """
    Unified memory manager combining short-term and long-term memory.
    """
    
    def __init__(self, user_id: str = "anonymous"):
        self.user_id = user_id
        self.short_term = SlidingWindowMemory()
        self.long_term = LongTermMemory(user_id=user_id)
    
    def add_user_message(self, content: str, turn_id: str = "") -> None:
        self.short_term.add("user", content, turn_id=turn_id)
    
    def add_assistant_message(self, content: str, turn_id: str = "") -> None:
        self.short_term.add("assistant", content, turn_id=turn_id)
    
    def get_llm_context(self) -> str:
        """Get combined context for LLM."""
        long_context = self.long_term.get_context_for_session()
        short_context = self.short_term.get_context()
        
        if long_context and short_context:
            return f"{long_context}\n\n{short_context}"
        return long_context or short_context
    
    def get_recent_turns(self, n: int = 5) -> list[MemoryEntry]:
        """Get last N turns (user+assistant pairs)."""
        entries = self.short_term.get_entries()
        # Group by turn_id
        turns = []
        current_turn = []
        for entry in entries:
            current_turn.append(entry)
            if entry.role == "assistant":
                turns.append(current_turn)
                current_turn = []
        return turns[-n:]
    
    def rewind_to_turn(self, turn_id: str) -> list[MemoryEntry]:
        """Rewind memory to a specific turn."""
        return self.short_term.rewind_to_turn(turn_id)
    
    def end_session(self) -> None:
        """Called at session end to persist summary."""
        # Generate session summary
        context = self.short_term.get_context()
        if context:
            summary = f"Session at {time.strftime('%Y-%m-%d %H:%M')}: {context[:500]}..."
            self.long_term.add_session_summary(summary)
        
        # Clear short-term but keep long-term
        self.short_term.clear()