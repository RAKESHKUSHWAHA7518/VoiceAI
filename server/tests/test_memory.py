from __future__ import annotations

import time

from server.app.memory import (
    SlidingWindowMemory,
    LongTermMemory,
    MemoryManager,
    MemoryEntry,
)


def test_sliding_window_memory_basic():
    """Test basic sliding window memory operations."""
    memory = SlidingWindowMemory(max_turns=3, max_tokens=1000)
    
    # Add entries
    memory.add("user", "Hello", turn_id="t1")
    memory.add("assistant", "Hi there!", turn_id="t1")
    memory.add("user", "How are you?", turn_id="t2")
    memory.add("assistant", "I'm good!", turn_id="t2")
    
    entries = memory.get_entries()
    assert len(entries) == 4
    assert entries[0].role == "user"
    assert entries[0].content == "Hello"
    assert entries[3].role == "assistant"
    assert entries[3].content == "I'm good!"
    
    # Check context
    context = memory.get_context()
    assert "user: Hello" in context
    assert "assistant: Hi there!" in context


def test_sliding_window_max_turns():
    """Test that sliding window evicts old entries."""
    memory = SlidingWindowMemory(max_turns=2, max_tokens=1000)
    
    # Add 3 turns (6 entries)
    for i in range(3):
        memory.add("user", f"User message {i}", turn_id=f"t{i}")
        memory.add("assistant", f"Response {i}", turn_id=f"t{i}")
    
    # Should only keep last 2 turns (4 entries)
    entries = memory.get_entries()
    assert len(entries) == 4
    assert entries[0].content == "User message 1"
    assert entries[3].content == "Response 2"


def test_sliding_window_context():
    """Test context generation."""
    memory = SlidingWindowMemory()
    memory.add("user", "Hello")
    memory.add("assistant", "Hi")
    
    context = memory.get_context()
    assert "user: Hello" in context
    assert "assistant: Hi" in context


def test_long_term_memory():
    """Test long-term memory operations."""
    memory = LongTermMemory(user_id="test_user")
    
    memory.update_profile("name", "John")
    memory.update_preference("language", "en")
    memory.add_session_summary("Session 1: talked about weather")
    
    context = memory.get_context_for_session()
    assert "John" in context
    assert "language: en" in context
    assert "weather" in context


def test_memory_manager():
    """Test MemoryManager integration."""
    manager = MemoryManager(user_id="test")
    
    manager.add_user_message("Hello", turn_id="t1")
    manager.add_assistant_message("Hi there!", turn_id="t1")
    
    context = manager.get_llm_context()
    assert "user: Hello" in context
    assert "assistant: Hi there!" in context


def test_sliding_window_summarization():
    """Test background summarization trigger."""
    memory = SlidingWindowMemory(max_turns=2, max_tokens=1000)
    
    # Add enough entries to trigger summarization
    for i in range(5):
        memory.add("user", f"User {i}")
        memory.add("assistant", f"Assistant {i}")
    
    # Should have triggered summarization
    assert len(memory.entries) <= 4  # max_turns * 2


def test_memory_entry():
    """Test MemoryEntry dataclass."""
    entry = MemoryEntry(
        role="user",
        content="Test message",
        turn_id="t1",
        tokens=5,
        metadata={"source": "test"},
    )
    
    assert entry.role == "user"
    assert entry.content == "Test message"
    assert entry.turn_id == "t1"
    assert entry.tokens == 5
    assert entry.metadata["source"] == "test"


def test_long_term_session_summary():
    """Test long-term session summary management."""
    memory = LongTermMemory(user_id="test")
    
    memory.add_session_summary("Session 1")
    memory.add_session_summary("Session 2")
    memory.add_session_summary("Session 3")
    
    # Should keep last 20, but we only have 3
    assert len(memory.session_summaries) == 3
    
    context = memory.get_context_for_session()
    assert "Session 3" in context


def test_memory_rewind():
    """Test memory rewind to specific turn."""
    memory = SlidingWindowMemory()
    
    memory.add("user", "Msg 1", turn_id="t1")
    memory.add("assistant", "Resp 1", turn_id="t1")
    memory.add("user", "Msg 2", turn_id="t2")
    memory.add("assistant", "Resp 2", turn_id="t2")
    memory.add("user", "Msg 3", turn_id="t3")
    memory.add("assistant", "Resp 3", turn_id="t3")
    
    rewound = memory.rewind_to_turn("t2")
    
    assert len(rewound) == 4  # t1 + t2
    assert rewound[-1].turn_id == "t2"
    assert rewound[-1].content == "Resp 2"


if __name__ == "__main__":
    test_sliding_window_memory_basic()
    print("✓ test_sliding_window_memory_basic")
    
    test_sliding_window_max_turns()
    print("✓ test_sliding_window_max_turns")
    
    test_sliding_window_context()
    print("✓ test_sliding_window_context")
    
    test_long_term_memory()
    print("✓ test_long_term_memory")
    
    test_memory_manager()
    print("✓ test_memory_manager")
    
    test_sliding_window_summarization()
    print("✓ test_sliding_window_summarization")
    
    test_memory_entry()
    print("✓ test_memory_entry")
    
    test_long_term_session_summary()
    print("✓ test_long_term_session_summary")
    
    test_memory_rewind()
    print("✓ test_memory_rewind")
    
    print("\nAll memory tests passed!")