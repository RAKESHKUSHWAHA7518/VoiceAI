// ============================================================================
// Real-Time Guardrails & PII Redaction Service (Target: < 25ms Latency)
// ============================================================================

import logger from '../utils/logger';

export interface GuardrailCheckResult {
  isSafe: boolean;
  sanitizedText: string;
  piiRedacted: boolean;
  promptInjectionDetected: boolean;
  violations: string[];
  latencyMs: number;
}

export class GuardrailsEngine {
  // Regex definitions for rapid PII scrubbing
  private static readonly SSN_REGEX = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g;
  private static readonly CARD_REGEX = /\b(?:\d{4}[- ]?){3}\d{4}\b|\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g;
  private static readonly EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  private static readonly PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  private static readonly API_KEY_REGEX = /\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35})\b/g;

  // Prompt injection heuristic signatures
  private static readonly INJECTION_PATTERNS = [
    /ignore (?:all )?(?:previous|above) instructions/i,
    /bypass (?:the )?system prompt/i,
    /reveal (?:your )?system prompt/i,
    /disregard (?:all )?rules/i,
    /you are now in (?:DAN|jailbreak) mode/i,
    /act as an? unrestricted/i,
    /forget everything you were told/i,
    /override (?:safety|guardrails)/i,
  ];

  /**
   * Scans and sanitizes input/output text against PII and prompt injection attacks
   * Meets strict <25ms latency budget with fail-open safety fallback
   */
  public inspect(text: string): GuardrailCheckResult {
    const startTime = performance.now();
    const violations: string[] = [];
    let sanitizedText = text;
    let piiRedacted = false;
    let promptInjectionDetected = false;

    try {
      // 1. Detect prompt injections
      for (const pattern of GuardrailsEngine.INJECTION_PATTERNS) {
        if (pattern.test(text)) {
          promptInjectionDetected = true;
          violations.push(`Prompt Injection pattern detected: ${pattern.source}`);
          break;
        }
      }

      // 2. Redact SSN
      if (GuardrailsEngine.SSN_REGEX.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(GuardrailsEngine.SSN_REGEX, '[REDACTED_SSN]');
        piiRedacted = true;
        violations.push('Social Security Number detected and redacted');
      }

      // 3. Redact Payment Cards
      if (GuardrailsEngine.CARD_REGEX.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(GuardrailsEngine.CARD_REGEX, '[REDACTED_CARD]');
        piiRedacted = true;
        violations.push('Payment Card Number detected and redacted');
      }

      // 4. Redact Emails
      if (GuardrailsEngine.EMAIL_REGEX.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(GuardrailsEngine.EMAIL_REGEX, '[REDACTED_EMAIL]');
        piiRedacted = true;
        violations.push('Email address detected and redacted');
      }

      // 5. Redact Phone Numbers
      if (GuardrailsEngine.PHONE_REGEX.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(GuardrailsEngine.PHONE_REGEX, '[REDACTED_PHONE]');
        piiRedacted = true;
        violations.push('Phone number detected and redacted');
      }

      // 6. Redact API Keys & Secrets
      if (GuardrailsEngine.API_KEY_REGEX.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(GuardrailsEngine.API_KEY_REGEX, '[REDACTED_API_KEY]');
        piiRedacted = true;
        violations.push('API key / secret token detected and redacted');
      }
    } catch (err) {
      logger.warn('Guardrails inspection error, failing open for low latency', { err });
    }

    const latencyMs = Number((performance.now() - startTime).toFixed(2));
    if (latencyMs > 25) {
      logger.warn('Guardrails inspection exceeded 25ms budget', { latencyMs });
    }

    return {
      isSafe: !promptInjectionDetected,
      sanitizedText,
      piiRedacted,
      promptInjectionDetected,
      violations,
      latencyMs,
    };
  }
}

export const guardrailsEngine = new GuardrailsEngine();
