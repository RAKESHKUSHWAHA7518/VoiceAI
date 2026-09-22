from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from server.app.config import settings


@dataclass(slots=True)
class ModerationResult:
    """Result of content moderation check."""
    allowed: bool
    reason: str = ""
    redacted_text: str = ""
    latency_ms: float = 0.0
    flags: list[str] = field(default_factory=list)


class PIIRedactor:
    """Fast PII detection and redaction using compiled regex patterns."""
    
    # Pre-compiled regex patterns for common PII types
    SSN_PATTERN = re.compile(r'\b\d{3}-\d{2}-\d{4}\b')
    CREDIT_CARD_PATTERN = re.compile(r'\b(?:\d{4}[- ]?){3}\d{4}\b')
    EMAIL_PATTERN = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
    PHONE_PATTERN = re.compile(r'\b(?:\+?1[- ]?)?(?:\(?\d{3}\)?[- ]?)?\d{3}[- ]?\d{4}\b')
    IP_PATTERN = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')
    DOB_PATTERN = re.compile(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b')
    
    # Replacement tokens
    REPLACEMENTS = {
        'ssn': '[SSN REDACTED]',
        'credit_card': '[CARD REDACTED]',
        'email': '[EMAIL REDACTED]',
        'phone': '[PHONE REDACTED]',
        'ip': '[IP REDACTED]',
        'dob': '[DOB REDACTED]',
    }
    
    def __init__(self, custom_patterns: dict[str, re.Pattern] = None):
        self.custom_patterns = custom_patterns or {}
    
    def redact(self, text: str) -> tuple[str, list[str]]:
        """
        Redact PII from text.
        Returns (redacted_text, list_of_detected_types).
        """
        if not text:
            return text, []
        
        redacted = text
        detected = []
        
        # SSN
        if self.SSN_PATTERN.search(redacted):
            redacted = self.SSN_PATTERN.sub(self.REPLACEMENTS['ssn'], redacted)
            detected.append('ssn')
        
        # Credit card
        if self.CREDIT_CARD_PATTERN.search(redacted):
            redacted = self.CREDIT_CARD_PATTERN.sub(self.REPLACEMENTS['credit_card'], redacted)
            detected.append('credit_card')
        
        # Email
        if self.EMAIL_PATTERN.search(redacted):
            redacted = self.EMAIL_PATTERN.sub(self.REPLACEMENTS['email'], redacted)
            detected.append('email')
        
        # Phone
        if self.PHONE_PATTERN.search(redacted):
            redacted = self.PHONE_PATTERN.sub(self.REPLACEMENTS['phone'], redacted)
            detected.append('phone')
        
        # IP
        if self.IP_PATTERN.search(redacted):
            redacted = self.IP_PATTERN.sub(self.REPLACEMENTS['ip'], redacted)
            detected.append('ip')
        
        # DOB
        if self.DOB_PATTERN.search(redacted):
            redacted = self.DOB_PATTERN.sub(self.REPLACEMENTS['dob'], redacted)
            detected.append('dob')
        
        # Custom patterns
        for name, pattern in self.custom_patterns.items():
            if pattern.search(redacted):
                redacted = pattern.sub(f'[{name.upper()} REDACTED]', redacted)
                detected.append(name)
        
        return redacted, detected


class InjectionDetector:
    """Detect prompt injection attempts using pattern matching."""
    
    # Common injection patterns
    INJECTION_PATTERNS = [
        # Direct instructions
        r'(?i)ignore\s+(?:all\s+)?(?:previous\s+)?(?:instructions|prompts|rules)',
        r'(?i)forget\s+(?:everything|all|previous)',
        r'(?i)you\s+are\s+now\s+(?:a|an)\s+\w+',
        r'(?i)act\s+as\s+(?:a|an)\s+\w+',
        r'(?i)pretend\s+(?:to\s+be|you\s+are)\s+(?:a|an)\s+\w+',
        # Role manipulation
        r'(?i)system\s*:\s*(?:you are|act as|pretend)',
        r'(?i)user\s*:\s*(?:ignore|forget|system)',
        # Output manipulation
        r'(?i)output\s+(?:only|just)\s+(?:the|this)',
        r'(?i)respond\s+(?:only|with)\s+(?:yes|no|true|false)',
        # Jailbreak patterns
        r'(?i)DAN\s+(?:mode|prompt)',
        r'(?i)developer\s+mode',
        r'(?i)unrestricted\s+(?:mode|access)',
        # Data exfiltration
        r'(?i)(?:show|print|display|output)\s+(?:your|the)\s+(?:prompt|instructions|system)',
        r'(?i)what\s+(?:is|are)\s+(?:your|the)\s+(?:instructions|prompt|system)',
        # Encoding evasion
        r'(?i)base64|rot13|encoded',
    ]
    
    def __init__(self, custom_patterns: list[str] = None):
        self.patterns = [re.compile(p) for p in self.INJECTION_PATTERNS]
        if custom_patterns:
            self.patterns.extend([re.compile(p) for p in custom_patterns])
    
    def detect(self, text: str) -> list[str]:
        """Detect injection patterns in text. Returns list of matched pattern descriptions."""
        if not text:
            return []
        
        detected = []
        for i, pattern in enumerate(self.patterns):
            if pattern.search(text):
                detected.append(f"injection_pattern_{i}")
        return detected
    
    def is_safe(self, text: str) -> bool:
        """Quick safety check - returns True if no injections detected."""
        return len(self.detect(text)) == 0


class ContentSafetyFilter:
    """Fast content safety filtering with configurable rules."""
    
    def __init__(
        self,
        blocked_words: list[str] = None,
        allowed_words: list[str] = None,
        max_length: int = 10000,
    ):
        self.blocked_patterns = [re.compile(rf'\b{re.escape(w)}\b', re.IGNORECASE) 
                                 for w in (blocked_words or [])]
        self.allowed_patterns = [re.compile(rf'\b{re.escape(w)}\b', re.IGNORECASE) 
                                 for w in (allowed_words or [])]
        self.max_length = max_length
    
    def check(self, text: str) -> ModerationResult:
        """Check text against safety rules."""
        start = time.perf_counter()
        
        if not text:
            return ModerationResult(allowed=True, latency_ms=0)
        
        # Length check
        if len(text) > self.max_length:
            return ModerationResult(
                allowed=False,
                reason=f"Text exceeds maximum length ({self.max_length})",
                latency_ms=(time.perf_counter() - start) * 1000,
                flags=["length_exceeded"],
            )
        
        # Blocked words
        for pattern in self.blocked_patterns:
            if pattern.search(text):
                return ModerationResult(
                    allowed=False,
                    reason=f"Blocked content detected",
                    latency_ms=(time.perf_counter() - start) * 1000,
                    flags=["blocked_word"],
                )
        
        return ModerationResult(
            allowed=True,
            latency_ms=(time.perf_counter() - start) * 1000,
        )


class GuardrailPipeline:
    """
    Unified guardrail pipeline with <25ms latency budget.
    
    Runs PII redaction, injection detection, and content safety in parallel
    for minimal latency impact.
    """
    
    def __init__(
        self,
        pii_redactor: PIIRedactor = None,
        injection_detector: InjectionDetector = None,
        content_filter: ContentSafetyFilter = None,
        enable_pii: bool = True,
        enable_injection: bool = True,
        enable_safety: bool = True,
        latency_budget_ms: float = 25.0,
    ):
        self.pii_redactor = pii_redactor or PIIRedactor()
        self.injection_detector = injection_detector or InjectionDetector()
        self.content_filter = content_filter or ContentSafetyFilter()
        self.enable_pii = enable_pii
        self.enable_injection = enable_injection
        self.enable_safety = enable_safety
        self.latency_budget_ms = latency_budget_ms
    
    async def check_input(self, text: str) -> ModerationResult:
        """Check user input with all enabled guards."""
        start = time.perf_counter()
        flags = []
        redacted = text
        
        # Run checks in parallel for latency optimization
        tasks = []
        
        if self.enable_pii:
            tasks.append(("pii", asyncio.to_thread(self._check_pii, text)))
        if self.enable_injection:
            tasks.append(("injection", asyncio.to_thread(self._check_injection, text)))
        if self.enable_safety:
            tasks.append(("safety", asyncio.to_thread(self._check_safety, text)))
        
        results = {}
        if tasks:
            for name, coro in tasks:
                try:
                    results[name] = await asyncio.wait_for(coro, timeout=0.1)  # 100ms per check
                except asyncio.TimeoutError:
                    results[name] = ModerationResult(
                        allowed=False, 
                        reason=f"{name} check timeout",
                        flags=["timeout"],
                    )
        
        # Aggregate results
        failed_reasons = []
        for name, result in results.items():
            # Always collect flags from all checks
            flags.extend(result.flags)
            if not result.allowed:
                failed_reasons.append(f"{name}: {', '.join(result.flags)}")
            if name == "pii" and result.redacted_text:
                redacted = result.redacted_text
        
        # Check overall latency
        total_latency = (time.perf_counter() - start) * 1000
        latency_exceeded = total_latency > self.latency_budget_ms
        
        if latency_exceeded:
            flags.append("latency_budget_exceeded")
        
        # Allow if no critical failures and latency OK
        # (fail-open for latency to avoid blocking conversation)
        allowed = all(r.allowed for r in results.values()) and not latency_exceeded
        
        return ModerationResult(
            allowed=allowed,
            reason="; ".join(failed_reasons) if not allowed else "",
            redacted_text=redacted,
            latency_ms=total_latency,
            flags=flags,
        )
    
    def _check_pii(self, text: str) -> ModerationResult:
        start = time.perf_counter()
        redacted, detected = self.pii_redactor.redact(text)
        return ModerationResult(
            allowed=True,  # PII never blocks, only flags and redacts
            redacted_text=redacted,
            latency_ms=(time.perf_counter() - start) * 1000,
            flags=[f"pii_{d}" for d in detected],
        )
    
    def _check_injection(self, text: str) -> ModerationResult:
        start = time.perf_counter()
        detected = self.injection_detector.detect(text)
        return ModerationResult(
            allowed=len(detected) == 0,
            latency_ms=(time.perf_counter() - start) * 1000,
            flags=[f"injection_{d}" for d in detected],
        )
    
    def _check_safety(self, text: str) -> ModerationResult:
        return self.content_filter.check(text)
    
    async def check_output(self, text: str) -> ModerationResult:
        """Check model output - similar to input but can have different rules."""
        # For output, we mainly check for PII leakage and safety
        return await self.check_input(text)


# Default instances
_default_pipeline: Optional[GuardrailPipeline] = None


def get_guardrail_pipeline() -> GuardrailPipeline:
    """Get or create default guardrail pipeline."""
    global _default_pipeline
    if _default_pipeline is None:
        _default_pipeline = GuardrailPipeline()
    return _default_pipeline