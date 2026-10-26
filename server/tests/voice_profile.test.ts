import { boundedVoiceContext, voiceRequestProfile } from '../src/services/voice_profile';
const pair = (id: string, size = 10) => [{ role: 'user' as const, content: id + 'u'.repeat(size) }, { role: 'assistant' as const, content: id + 'a'.repeat(size) }];
test('keeps complete newest exchanges without mutating the saved history', () => {
  const history = [...pair('old'), ...pair('middle'), ...pair('new')]; const original = structuredClone(history);
  const context = boundedVoiceContext(history, 80, 4);
  expect(context.messages).toEqual(history.slice(-4)); expect(context.trimmed).toBe(true); expect(context.chars).toBeLessThanOrEqual(80);
  context.messages[0].content = 'changed'; expect(history).toEqual(original);
});
test('does not substitute stale older context when the newest exchange exceeds the budget', () => {
  const profile = voiceRequestProfile([...pair('old'), ...pair('large', 7000)]);
  expect(profile.messages).toEqual([]); expect(profile.trimmed).toBe(true);
  expect(profile.instruction).toContain('ask the caller to repeat');
});
test('retains exact identifiers and supports an unchanged baseline comparison', () => {
  const history = [{ role: 'user' as const, content: 'Booking ID: ABC-123, date: 2026-10-30' }, { role: 'assistant' as const, content: 'I will check that booking.' }];
  expect(voiceRequestProfile(history).messages).toEqual(history);
  expect(voiceRequestProfile(history, false)).toMatchObject({ messages: history, trimmed: false });
  expect(voiceRequestProfile(history).instruction).toContain('required warnings');
});
test('benchmark percentiles handle unsorted samples, failures and empty results', () => {
  const { percentile } = require('../../scripts/latency-report.cjs');
  expect(percentile([30, null, NaN, 10, 20], 50)).toBe(20);
  expect(percentile([], 95)).toBeNull();
});
