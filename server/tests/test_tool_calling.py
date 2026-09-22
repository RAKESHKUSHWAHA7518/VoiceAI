from __future__ import annotations

import asyncio
import json
import time

from server.app.llm import (
    StreamingLLM,
    SentenceChunker,
    ToolRegistry,
    Tool,
    CircuitBreaker,
    CircuitBreakerOpenError,
    ToolExecutor,
    HallucinationChecker,
    StreamingToolExecutor,
    ToolResult,
)
from server.app.llm.streaming import LLMToken


class MockStreamingLLM(StreamingLLM):
    """Mock LLM that yields predefined tokens."""

    def __init__(self, tokens: list[LLMToken]):
        self._tokens = tokens
        # Don't call parent __init__ to avoid needing API key
        self.client = None
        self.model = "mock"
        self.temperature = 0.3
        self.max_tokens = 512
        self.system_prompt = "Test prompt"

    async def stream_chat(self, history, user_text, tools=None):
        for token in self._tokens:
            yield token
            await asyncio.sleep(0.001)


def test_sentence_chunker():
    """Test sentence boundary chunking."""
    chunker = SentenceChunker()
    
    # Add partial sentence
    chunks = chunker.add("Hello there. ")
    assert chunks == []
    
    # Complete sentence - "How are you?" has 3 words < MIN_WORDS=4
    # But it's a complete sentence ending with ?, so it gets chunked via flush
    chunks = chunker.add("How are you? ")
    assert "Hello there." in chunks
    # "How are you?" is in buffer, retrieved via flush
    final = chunker.flush()
    assert final == "How are you?"
    
    # Flush remainder
    chunker.add("I am fine")
    final = chunker.flush()
    assert final == "I am fine"


def test_sentence_chunker_forced():
    """Test forced chunking on long text without boundaries."""
    chunker = SentenceChunker()
    
    long_text = " ".join(["word"] * 50)  # ~250 chars, no punctuation
    chunks = chunker.add(long_text + " ")
    # Should chunk at MAX_CHARS (200)
    assert len(chunks) >= 1


def test_tool_registry():
    """Test tool registration and schema generation."""
    registry = ToolRegistry()
    
    async def handler(args):
        return {"result": "ok"}
    
    tool = Tool(
        name="test_tool",
        description="A test tool",
        parameters={"type": "object", "properties": {}},
        handler=handler,
    )
    registry.register(tool)
    
    schema = registry.get_schema()
    assert len(schema) == 1
    assert schema[0]["function"]["name"] == "test_tool"
    assert schema[0]["function"]["description"] == "A test tool"
    
    handler_fn = registry.get_handler("test_tool")
    assert handler_fn is handler


async def test_circuit_breaker():
    """Test circuit breaker state transitions."""
    breaker = CircuitBreaker(failure_threshold=2, timeout=1.0)
    
    # Success should keep closed
    async def succeed():
        return "ok"
    result = await breaker.call(succeed)
    assert result == "ok"
    assert breaker.state == "closed"
    
    # Two failures should open
    async def fail():
        raise ValueError("fail")
    
    try:
        await breaker.call(fail)
    except ValueError:
        pass
    assert breaker.state == "closed"
    assert breaker.failure_count == 1
    
    try:
        await breaker.call(fail)
    except ValueError:
        pass
    assert breaker.state == "open"
    assert breaker.failure_count == 2
    
    # Should raise CircuitBreakerOpenError
    try:
        await breaker.call(succeed)
        assert False, "Should have raised"
    except CircuitBreakerOpenError:
        pass
    
    # Wait for timeout and try again (half-open)
    await asyncio.sleep(1.1)
    result = await breaker.call(succeed)
    assert result == "ok"
    assert breaker.state == "closed"
    assert breaker.failure_count == 0


async def test_circuit_breaker_fallback():
    """Test circuit breaker fallback message."""
    breaker = CircuitBreaker(failure_threshold=1, timeout=1.0)
    
    async def fail():
        raise ValueError("fail")
    
    try:
        await breaker.call(fail)
    except ValueError:
        pass
    
    fallback = breaker.get_fallback_message()
    assert "trouble" in fallback.lower() or "try again" in fallback.lower()


async def test_tool_executor_basic():
    """Test basic tool execution."""
    registry = ToolRegistry()
    
    async def handler(args):
        await asyncio.sleep(0.1)
        return {"result": args.get("value", "default")}
    
    registry.register(Tool(
        name="test_tool",
        description="Test",
        parameters={},
        handler=handler,
    ))
    
    executor = ToolExecutor(registry)
    result, used_filler, used_fallback = await executor.execute(
        "test_tool", {"value": "test"}, on_filler=lambda x: None
    )
    
    assert result == {"result": "test"}
    assert used_filler is False
    assert used_fallback is False


async def test_tool_executor_filler():
    """Test filler audio triggers after threshold."""
    registry = ToolRegistry()
    
    async def slow_handler(args):
        await asyncio.sleep(0.6)  # > 400ms threshold
        return {"done": True}
    
    registry.register(Tool(
        name="slow_tool",
        description="Slow",
        parameters={},
        handler=slow_handler,
    ))
    
    filler_called = []
    executor = ToolExecutor(registry, filler_delay_threshold_ms=200)
    result, used_filler, used_fallback = await executor.execute(
        "slow_tool", {}, on_filler=lambda x: filler_called.append(x)
    )
    
    assert result == {"done": True}
    assert used_filler is True
    assert len(filler_called) == 1


async def test_tool_executor_timeout_fallback():
    """Test timeout triggers fallback."""
    registry = ToolRegistry()
    
    async def very_slow(args):
        await asyncio.sleep(2.0)
        return {"done": True}
    
    registry.register(Tool(
        name="very_slow",
        description="Very slow",
        parameters={},
        handler=very_slow,
    ))
    
    executor = ToolExecutor(registry, tool_timeout=0.1, filler_delay_threshold_ms=5000)
    result, used_filler, used_fallback = await executor.execute(
        "very_slow", {}, on_filler=lambda x: None
    )
    
    assert used_fallback is True
    assert result.get("fallback") is True
    assert "timeout" in result


async def test_tool_executor_circuit_breaker_fallback():
    """Test circuit breaker open triggers fallback."""
    registry = ToolRegistry()
    
    async def fail(args):
        raise ValueError("fail")
    
    registry.register(Tool(
        name="failing_tool",
        description="Fails",
        parameters={},
        handler=fail,
    ))
    
    executor = ToolExecutor(registry, filler_delay_threshold_ms=5000)  # No filler
    
    # First call fails
    try:
        await executor.execute("failing_tool", {})
    except ValueError:
        pass
    
    # Second call opens breaker
    try:
        await executor.execute("failing_tool", {})
    except ValueError:
        pass
    
    # Third call should use fallback
    result, used_filler, used_fallback = await executor.execute("failing_tool", {})
    assert used_fallback is True
    assert result.get("fallback") is True


async def test_hallucination_checker():
    """Test hallucination detection."""
    checker = HallucinationChecker()
    
    tool_result = {
        "temperature": 72,
        "date": "2024-12-25",
        "booking_id": "ABC12345",
        "price": "$29.99",
        "phone": "555-123-4567",
    }
    
    # Correct output
    llm_text = "The temperature is 72 degrees on 2024-12-25. Your booking ABC12345 costs $29.99. Call 555-123-4567."
    passed, mismatches = checker.check(llm_text, tool_result)
    assert passed
    assert mismatches == []
    
    # Hallucinated number
    llm_text = "The temperature is 100 degrees."
    passed, mismatches = checker.check(llm_text, tool_result)
    assert not passed
    assert any("number" in m for m in mismatches)
    
    # Hallucinated date
    llm_text = "The date is 2025-01-01."
    passed, mismatches = checker.check(llm_text, tool_result)
    assert not passed
    assert any("date" in m for m in mismatches)


async def test_streaming_tool_executor():
    """Test StreamingToolExecutor with structured results."""
    registry = ToolRegistry()
    
    async def handler(args):
        await asyncio.sleep(0.1)
        return {"status": "ok", "data": args}
    
    registry.register(Tool(
        name="test",
        description="Test",
        parameters={},
        handler=handler,
    ))
    
    executor = ToolExecutor(registry)
    streaming = StreamingToolExecutor(executor)
    
    results = []
    tool_result = await streaming.execute_and_stream(
        "test", {"key": "value"},
        on_result=lambda tr: results.append(tr)
    )
    
    assert tool_result.success
    assert tool_result.result == {"status": "ok", "data": {"key": "value"}}
    assert not tool_result.used_fallback
    assert tool_result.latency_ms > 0
    assert len(results) == 1


async def test_streaming_tool_executor_fallback():
    """Test StreamingToolExecutor with fallback."""
    registry = ToolRegistry()
    
    async def fail(args):
        raise ValueError("fail")
    
    registry.register(Tool(
        name="failing",
        description="Fails",
        parameters={},
        handler=fail,
    ))
    
    executor = ToolExecutor(registry, filler_delay_threshold_ms=5000)
    streaming = StreamingToolExecutor(executor)
    
    # Open circuit breaker
    await executor.execute("failing", {})
    await executor.execute("failing", {})
    
    # Now should fallback
    tool_result = await streaming.execute_and_stream("failing", {})
    
    assert not tool_result.success
    assert tool_result.used_fallback
    assert tool_result.error is not None


def test_tool_result_dataclass():
    """Test ToolResult structure."""
    result = ToolResult(
        tool_name="test",
        success=True,
        result={"data": "ok"},
        used_filler=True,
        latency_ms=150.0,
    )
    
    assert result.tool_name == "test"
    assert result.success
    assert result.result == {"data": "ok"}
    assert result.used_filler
    assert result.latency_ms == 150.0


if __name__ == "__main__":
    test_sentence_chunker()
    print("✓ test_sentence_chunker")
    
    test_sentence_chunker_forced()
    print("✓ test_sentence_chunker_forced")
    
    test_tool_registry()
    print("✓ test_tool_registry")
    
    asyncio.run(test_circuit_breaker())
    print("✓ test_circuit_breaker")
    
    asyncio.run(test_circuit_breaker_fallback())
    print("✓ test_circuit_breaker_fallback")
    
    asyncio.run(test_tool_executor_basic())
    print("✓ test_tool_executor_basic")
    
    asyncio.run(test_tool_executor_filler())
    print("✓ test_tool_executor_filler")
    
    asyncio.run(test_tool_executor_timeout_fallback())
    print("✓ test_tool_executor_timeout_fallback")
    
    asyncio.run(test_tool_executor_circuit_breaker_fallback())
    print("✓ test_tool_executor_circuit_breaker_fallback")
    
    asyncio.run(test_hallucination_checker())
    print("✓ test_hallucination_checker")
    
    asyncio.run(test_streaming_tool_executor())
    print("✓ test_streaming_tool_executor")
    
    asyncio.run(test_streaming_tool_executor_fallback())
    print("✓ test_streaming_tool_executor_fallback")
    
    test_tool_result_dataclass()
    print("✓ test_tool_result_dataclass")
    
    print("\nAll Phase 3 tool calling tests passed!")