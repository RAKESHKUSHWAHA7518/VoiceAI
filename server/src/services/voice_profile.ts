export interface ContextMessage { role: 'user' | 'assistant'; content: string }
export const VOICE_REPLY_STYLE = 'For ordinary voice questions, answer in one or two short natural sentences, then let the caller respond. Give more detail when explicitly requested or needed for accuracy. Ask one clarification at a time. Do not omit required warnings, tool verification, or important conditions for brevity. No markdown.';

// Keep complete recent exchanges. Never splice a booking ID, date or tool result.
export function boundedVoiceContext(history: ContextMessage[], maxChars = 12000, maxMessages = 12) {
  const messages: ContextMessage[] = []; let chars = 0;
  for (let end = history.length; end > 0; end -= 2) {
    const pair = history.slice(Math.max(0, end - 2), end);
    if (pair.length !== 2 || pair[0].role !== 'user' || pair[1].role !== 'assistant') break;
    const cost = pair.reduce((sum, value) => sum + value.content.length, 0);
    if (chars + cost > maxChars || messages.length + pair.length > maxMessages) break;
    messages.unshift(...pair.map(value => ({ ...value }))); chars += cost;
  }
  return { messages, chars, trimmed: messages.length !== history.length };
}

export function voiceRequestProfile(history: ContextMessage[], fast = true) {
  if (!fast) return { messages: history, chars: history.reduce((sum, value) => sum + value.content.length, 0), trimmed: false, instruction: 'Speak in brief natural sentences. No markdown.' };
  const context = boundedVoiceContext(history);
  return { ...context, instruction: VOICE_REPLY_STYLE + (context.trimmed ? ' Some earlier exchanges were omitted from this request. Do not invent missing facts or assume an earlier booking detail; ask the caller to repeat it when needed.' : '') };
}
