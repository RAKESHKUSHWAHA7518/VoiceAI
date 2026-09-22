from __future__ import annotations

import asyncio
import random
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Tool:
    name: str
    description: str
    parameters: dict  # JSON schema
    handler: Callable[[dict], Any]


class ToolRegistry:
    """Registry of available tools with OpenAI function schema."""

    def __init__(self):
        self.tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self.tools[tool.name] = tool

    def get_schema(self) -> list[dict]:
        """Return OpenAI-compatible function schemas."""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
            for tool in self.tools.values()
        ]

    def get_handler(self, name: str) -> Callable | None:
        tool = self.tools.get(name)
        return tool.handler if tool else None


class CircuitBreaker:
    """Circuit breaker for tool failures with fallback."""

    def __init__(
        self,
        failure_threshold: int = 3,
        timeout: float = 30.0,
        expected_exception: type = Exception,
    ):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.expected_exception = expected_exception
        self.failure_count = 0
        self.last_failure_time: float = 0
        self.state = "closed"  # closed, open, half-open

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        if self.state == "open":
            if time.time() - self.last_failure_time > self.timeout:
                self.state = "half-open"
            else:
                raise CircuitBreakerOpenError("Circuit breaker open")

        try:
            result = await func(*args, **kwargs)
            if self.state == "half-open":
                self.state = "closed"
                self.failure_count = 0
            return result
        except self.expected_exception:
            self.failure_count += 1
            self.last_failure_time = time.time()
            if self.failure_count >= self.failure_threshold:
                self.state = "open"
            raise

    def is_open(self) -> bool:
        if self.state == "open":
            if time.time() - self.last_failure_time > self.timeout:
                self.state = "half-open"
                return False
            return True
        return False

    def get_fallback_message(self) -> str:
        """Get conversational fallback message."""
        return "I'm having trouble reaching that service right now. Could we try again in a moment, or would you like me to help with something else?"


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open."""
    pass


class ToolExecutor:
    """Executes tool calls with filler audio, circuit breaker, and fallback."""

    def __init__(
        self,
        registry: ToolRegistry,
        filler_audio_pool: list[str] | None = None,
        filler_delay_threshold_ms: int = 400,
        tool_timeout: float = 1.5,
        tts_callback: Callable[[str], Any] | None = None,
    ):
        self.registry = registry
        self.filler_audio_pool = filler_audio_pool or [
            "Let me check that for you...",
            "One moment please...",
            "I'll look that up...",
            "Give me a second...",
            "Let me see...",
            "Checking now...",
        ]
        self._filler_index = 0
        self.filler_delay_threshold_ms = filler_delay_threshold_ms
        self.tool_timeout = tool_timeout
        self.tts_callback = tts_callback
        self.circuit_breakers: dict[str, CircuitBreaker] = {}

    def _get_breaker(self, tool_name: str) -> CircuitBreaker:
        if tool_name not in self.circuit_breakers:
            self.circuit_breakers[tool_name] = CircuitBreaker()
        return self.circuit_breakers[tool_name]

    def _get_next_filler(self) -> str:
        """Get next filler phrase (round-robin to avoid repetition)."""
        filler = self.filler_audio_pool[self._filler_index % len(self.filler_audio_pool)]
        self._filler_index += 1
        return filler

    async def execute(
        self,
        tool_name: str,
        arguments: dict,
        on_filler: Callable[[str], Any] | None = None,
    ) -> tuple[Any, bool, bool]:
        """
        Execute tool with timeout, filler, and fallback.
        Returns (result, used_filler, used_fallback).
        """
        handler = self.registry.get_handler(tool_name)
        if not handler:
            raise ValueError(f"Tool not found: {tool_name}")

        breaker = self._get_breaker(tool_name)
        filler_task: asyncio.Task | None = None
        handler_task: asyncio.Task | None = None
        used_filler = False
        used_fallback = False

        async def run_with_filler():
            nonlocal used_filler
            await asyncio.sleep(self.filler_delay_threshold_ms / 1000)
            # Only play filler if handler hasn't completed yet
            if handler_task is not None and not handler_task.done():
                filler_text = self._get_next_filler()
                if on_filler:
                    import inspect
                    if inspect.iscoroutinefunction(on_filler):
                        await on_filler(filler_text)
                    else:
                        on_filler(filler_text)
                elif self.tts_callback:
                    import inspect
                    if inspect.iscoroutinefunction(self.tts_callback):
                        await self.tts_callback(filler_text)
                    else:
                        self.tts_callback(filler_text)
                used_filler = True

        try:
            filler_task = asyncio.create_task(run_with_filler())
            handler_task = asyncio.create_task(breaker.call(handler, arguments))
            result = await asyncio.wait_for(handler_task, timeout=self.tool_timeout)
            return result, used_filler, False
        except CircuitBreakerOpenError:
            # Circuit breaker open - use fallback
            used_fallback = True
            fallback_msg = breaker.get_fallback_message()
            if on_filler:
                import inspect
                if inspect.iscoroutinefunction(on_filler):
                    await on_filler(fallback_msg)
                else:
                    on_filler(fallback_msg)
            elif self.tts_callback:
                import inspect
                if inspect.iscoroutinefunction(self.tts_callback):
                    await self.tts_callback(fallback_msg)
                else:
                    self.tts_callback(fallback_msg)
            return {"fallback": True, "message": fallback_msg}, used_filler, True
        except asyncio.TimeoutError:
            # Timeout - use fallback
            used_fallback = True
            fallback_msg = f"That's taking longer than expected. {breaker.get_fallback_message()}"
            if on_filler:
                import inspect
                if inspect.iscoroutinefunction(on_filler):
                    await on_filler(fallback_msg)
                else:
                    on_filler(fallback_msg)
            elif self.tts_callback:
                import inspect
                if inspect.iscoroutinefunction(self.tts_callback):
                    await self.tts_callback(fallback_msg)
                else:
                    self.tts_callback(fallback_msg)
            return {"fallback": True, "timeout": True, "message": fallback_msg}, used_filler, True
        except Exception as e:
            # Other error - use fallback
            used_fallback = True
            fallback_msg = f"I ran into an issue: {str(e)}. {breaker.get_fallback_message()}"
            if on_filler:
                import inspect
                if inspect.iscoroutinefunction(on_filler):
                    await on_filler(fallback_msg)
                else:
                    on_filler(fallback_msg)
            elif self.tts_callback:
                import inspect
                if inspect.iscoroutinefunction(self.tts_callback):
                    await self.tts_callback(fallback_msg)
                else:
                    self.tts_callback(fallback_msg)
            return {"fallback": True, "error": str(e), "message": fallback_msg}, used_filler, True
        finally:
            if filler_task and not filler_task.done():
                filler_task.cancel()
            if handler_task and not handler_task.done():
                handler_task.cancel()


class HallucinationChecker:
    """Verify LLM output matches tool results for numbers/dates/IDs."""

    def __init__(self):
        import re
        self.number_pattern = re.compile(r'\b\d+(?:[.,]\d+)?\b')
        self.date_pattern = re.compile(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b')
        self.id_pattern = re.compile(r'\b[A-Z]{2,}\d{4,}\b')
        self.currency_pattern = re.compile(r'\$\d+(?:[.,]\d+)?')
        self.phone_pattern = re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b')

    def check(self, llm_text: str, tool_result: dict) -> tuple[bool, list[str]]:
        """
        Check if LLM output matches tool result.
        Returns (passed, mismatches).
        """
        mismatches = []

        tool_values = self._extract_values(tool_result)

        # Check each pattern type
        for pattern_name, pattern in [
            ("number", self.number_pattern),
            ("date", self.date_pattern),
            ("id", self.id_pattern),
            ("currency", self.currency_pattern),
            ("phone", self.phone_pattern),
        ]:
            llm_matches = pattern.findall(llm_text)
            tool_matches = tool_values.get(pattern_name, [])

            # Normalize for comparison
            llm_normalized = [self._normalize(match, pattern_name) for match in llm_matches]
            tool_normalized = [self._normalize(match, pattern_name) for match in tool_matches]

            for match, norm in zip(llm_matches, llm_normalized):
                if norm not in tool_normalized:
                    mismatches.append(f"{pattern_name}: '{match}' not in tool result")

        return len(mismatches) == 0, mismatches

    def _normalize(self, value: str, pattern_name: str) -> str:
        """Normalize value for comparison."""
        if pattern_name == "number":
            return value.replace(",", "").replace(".", "")
        elif pattern_name == "date":
            return value.replace("/", "-")
        elif pattern_name == "currency":
            return value.replace("$", "").replace(",", "")
        elif pattern_name == "phone":
            return "".join(filter(str.isdigit, value))
        return value

    def _extract_values(self, obj: Any) -> dict[str, list[str]]:
        """Recursively extract numbers, dates, IDs from tool result."""
        values: dict[str, list[str]] = {
            "number": [],
            "date": [],
            "id": [],
            "currency": [],
            "phone": [],
        }

        if isinstance(obj, dict):
            for v in obj.values():
                for k, val in self._extract_values(v).items():
                    values[k].extend(val)
        elif isinstance(obj, list):
            for item in obj:
                for k, val in self._extract_values(item).items():
                    values[k].extend(val)
        elif isinstance(obj, (int, float)):
            values["number"].append(str(obj))
        elif isinstance(obj, str):
            values["number"].extend(self.number_pattern.findall(obj))
            values["date"].extend(self.date_pattern.findall(obj))
            values["id"].extend(self.id_pattern.findall(obj))
            values["currency"].extend(self.currency_pattern.findall(obj))
            values["phone"].extend(self.phone_pattern.findall(obj))

        return values


@dataclass(slots=True)
class ToolResult:
    """Structured tool execution result."""
    tool_name: str
    success: bool
    result: Any = None
    error: str | None = None
    used_filler: bool = False
    used_fallback: bool = False
    latency_ms: float = 0.0


class StreamingToolExecutor:
    """Execute tools and stream results back for multi-turn tool use."""

    def __init__(self, executor: ToolExecutor):
        self.executor = executor

    async def execute_and_stream(
        self,
        tool_name: str,
        arguments: dict,
        on_filler: Callable[[str], Any] | None = None,
        on_result: Callable[[ToolResult], Any] | None = None,
    ) -> ToolResult:
        """Execute tool and return structured result."""
        start = time.time()
        result, used_filler, used_fallback = await self.executor.execute(
            tool_name, arguments, on_filler
        )
        latency_ms = (time.time() - start) * 1000

        if used_fallback:
            tool_result = ToolResult(
                tool_name=tool_name,
                success=False,
                result=result,
                error=result.get("message") if isinstance(result, dict) else "Fallback used",
                used_filler=used_filler,
                used_fallback=True,
                latency_ms=latency_ms,
            )
        else:
            tool_result = ToolResult(
                tool_name=tool_name,
                success=True,
                result=result,
                used_filler=used_filler,
                latency_ms=latency_ms,
            )

        if on_result:
            import inspect
            if inspect.iscoroutinefunction(on_result):
                await on_result(tool_result)
            else:
                on_result(tool_result)

        return tool_result