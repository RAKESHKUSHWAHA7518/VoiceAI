from __future__ import annotations

import asyncio
import json
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from openai import AsyncOpenAI

from server.app.config import settings


@dataclass(slots=True)
class LLMToken:
    text: str
    is_tool_call: bool = False
    tool_call_id: str | None = None
    tool_name: str | None = None
    tool_args: str | None = None
    tool_args_complete: bool = False  # True when args JSON is complete


@dataclass(slots=True)
class LLMResponse:
    tokens: list[LLMToken] = field(default_factory=list)
    tool_calls: list[dict] = field(default_factory=list)
    finish_reason: str | None = None


class StreamingLLM:
    """Streaming LLM with early tool call detection and function calling."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-4o-mini",
        temperature: float = 0.3,
        max_tokens: int = 512,
        system_prompt: str | None = None,
    ):
        self.client = AsyncOpenAI(api_key=api_key or settings.openai_api_key)
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.system_prompt = system_prompt or self._default_system_prompt()

    def _default_system_prompt(self) -> str:
        return """You are a helpful voice assistant. Speak naturally in short, conversational sentences. 
Avoid markdown, emojis, or special formatting. Spell out numbers (e.g., "twenty-five" not "25").
Keep responses concise and spoken-language appropriate. Use contractions and natural fillers."""

    def _build_messages(self, history: list[dict], user_text: str) -> list[dict]:
        messages = [{"role": "system", "content": self.system_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": user_text})
        return messages

    async def stream_chat(
        self,
        history: list[dict],
        user_text: str,
        tools: list[dict] | None = None,
    ) -> AsyncIterator[LLMToken]:
        """Stream tokens from LLM with early tool call detection."""
        messages = self._build_messages(history, user_text)

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": True,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        stream = await self.client.chat.completions.create(**kwargs)

        tool_call_buffer: dict[int, dict] = {}
        emitted_tool_calls: set[int] = set()

        async for chunk in stream:
            if not chunk.choices:
                continue

            choice = chunk.choices[0]
            delta = choice.delta

            # Handle tool calls - yield as soon as we have name + valid JSON args
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    index = tc.index
                    if index not in tool_call_buffer:
                        tool_call_buffer[index] = {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": "", "arguments": ""},
                        }
                    if tc.function:
                        if tc.function.name:
                            tool_call_buffer[index]["function"]["name"] += tc.function.name
                        if tc.function.arguments:
                            tool_call_buffer[index]["function"]["arguments"] += tc.function.arguments

                    # Check if we can emit this tool call early
                    tc_data = tool_call_buffer[index]
                    if (index not in emitted_tool_calls 
                        and tc_data["function"]["name"] 
                        and self._is_valid_json(tc_data["function"]["arguments"])):
                        emitted_tool_calls.add(index)
                        yield LLMToken(
                            text="",
                            is_tool_call=True,
                            tool_call_id=tc_data["id"],
                            tool_name=tc_data["function"]["name"],
                            tool_args=tc_data["function"]["arguments"],
                            tool_args_complete=True,
                        )

            # Handle content tokens
            if delta.content:
                yield LLMToken(text=delta.content)

            # Check for finish
            if choice.finish_reason:
                # Yield any remaining complete tool calls
                for index, tc_data in tool_call_buffer.items():
                    if index not in emitted_tool_calls and tc_data["function"]["name"]:
                        # Try to parse/fix args
                        args = tc_data["function"]["arguments"]
                        if not self._is_valid_json(args):
                            args = self._fix_json(args)
                        yield LLMToken(
                            text="",
                            is_tool_call=True,
                            tool_call_id=tc_data["id"],
                            tool_name=tc_data["function"]["name"],
                            tool_args=args,
                            tool_args_complete=True,
                        )
                break

    def _is_valid_json(self, s: str) -> bool:
        """Check if string is valid JSON."""
        try:
            json.loads(s)
            return True
        except json.JSONDecodeError:
            return False

    def _fix_json(self, s: str) -> str:
        """Attempt to fix incomplete JSON by closing braces."""
        if not s:
            return "{}"
        # Count open/close braces
        open_braces = s.count("{")
        close_braces = s.count("}")
        open_brackets = s.count("[")
        close_brackets = s.count("]")
        
        # Add missing closing brackets/braces
        fixed = s
        for _ in range(open_brackets - close_brackets):
            fixed += "]"
        for _ in range(open_braces - close_braces):
            fixed += "}"
        
        # Validate
        if self._is_valid_json(fixed):
            return fixed
        return "{}"  # Fallback


class SentenceChunker:
    """Chunks streaming tokens into sentence boundaries for TTS dispatch."""

    BOUNDARY_PATTERN = re.compile(r'(?<=[.!?])\s+(?=[A-Z])')
    MIN_WORDS = 4
    MAX_CHARS = 200

    def __init__(self):
        self.buffer = ""

    def add(self, text: str) -> list[str]:
        """Add text to buffer, return list of complete chunks ready for TTS."""
        self.buffer += text
        chunks = []

        boundaries = [(m.start(), m.end()) for m in self.BOUNDARY_PATTERN.finditer(self.buffer)]

        last_end = 0
        for start, end in boundaries:
            candidate = self.buffer[last_end:end].strip()
            # Chunk if we have enough words OR it's a complete sentence (ends with punctuation)
            is_complete_sentence = candidate and candidate[-1] in '.!?'
            if is_complete_sentence or len(candidate.split()) >= self.MIN_WORDS or len(candidate) >= self.MAX_CHARS:
                chunks.append(candidate)
                last_end = end

        # If no boundaries found but buffer exceeds MAX_CHARS, force chunk
        if not boundaries and len(self.buffer) >= self.MAX_CHARS:
            chunk = self.buffer[:self.MAX_CHARS].strip()
            chunks.append(chunk)
            self.buffer = self.buffer[self.MAX_CHARS:]
            return chunks

        self.buffer = self.buffer[last_end:]
        return chunks

    def flush(self) -> str | None:
        """Flush remaining buffer as final chunk."""
        if self.buffer.strip():
            chunk = self.buffer.strip()
            self.buffer = ""
            return chunk
        return None

    def reset(self) -> None:
        self.buffer = ""


class SpeculativeLLM:
    """Speculative LLM prefetching on interim transcripts."""

    def __init__(self, llm: StreamingLLM):
        self.llm = llm
        self._speculative_task: asyncio.Task | None = None

    async def start_speculative(
        self, history: list[dict], interim_text: str, tools: list[dict] | None = None
    ) -> None:
        """Start low-temperature speculative generation on interim transcript."""
        if self._speculative_task and not self._speculative_task.done():
            self._speculative_task.cancel()

        self._speculative_task = asyncio.create_task(
            self._run_speculative(history, interim_text, tools),
        )

    async def _run_speculative(
        self,
        history: list[dict],
        interim_text: str,
        tools: list[dict] | None,
    ) -> None:
        """Run speculative generation (fire and forget)."""
        try:
            orig_temp = self.llm.temperature
            self.llm.temperature = min(0.1, orig_temp)
            async for _ in self.llm.stream_chat(history, interim_text + " [continue]", tools):
                pass
            self.llm.temperature = orig_temp
        except asyncio.CancelledError:
            self.llm.temperature = orig_temp
        except Exception:
            self.llm.temperature = orig_temp

    def cancel(self) -> None:
        if self._speculative_task and not self._speculative_task.done():
            self._speculative_task.cancel()
            self._speculative_task = None