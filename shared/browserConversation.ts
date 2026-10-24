export interface ConversationSession { session_id: string; greeting: string; runtime_mode: 'demo' | 'live'; speech_output: string; token?: string }
export interface ToolEvent { name: string; status: 'completed' | 'error'; result: string; timestamp: number }
export interface CompletedTurn { tool_events?: ToolEvent[]; type: 'complete'; turn_id: string; output: string; runtime_mode: string; sources: Array<{ doc_id: string; title: string }>; metrics: { retrieval_ms: number; llm_ttft_ms: number | null; processing_ms: number; audible_latency_ms: null } }
async function responseError(response: Response) {
  const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
  return new Error(result.error?.message || `Request failed (${response.status})`);
}
export async function openConversation(agentId: string, signal?: AbortSignal): Promise<ConversationSession> {
  const response = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId }), signal });
  if (!response.ok) throw await responseError(response);
  return await response.json() as ConversationSession;
}
export async function openDemoConversation(signal?: AbortSignal): Promise<ConversationSession> {
  const response = await fetch('/api/public/demo', { method: 'POST', signal });
  if (!response.ok) throw await responseError(response);
  return await response.json() as ConversationSession;
}
export async function streamTurn(sessionId: string, text: string, onText?: (text: string) => void, signal?: AbortSignal, token?: string, onTool?: (event: ToolEvent) => void): Promise<CompletedTurn> {
  const response = await fetch(`/api/${token ? 'public/sessions' : 'conversations'}/${sessionId}/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ text }), signal, credentials: token ? 'omit' : 'same-origin' });
  if (!response.ok) throw await responseError(response);
  if (!response.body) throw new Error('This browser cannot read streaming responses.');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let buffer = ''; let complete: CompletedTurn | undefined;
  const readLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'tool_result') onTool?.(event);
    if (event.type === 'delta') onText?.(event.text);
    if (event.type === 'complete') complete = event;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 128000) throw new Error('The response exceeded its size limit.');
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) readLine(line);
    }
    buffer += decoder.decode(); if (buffer.trim()) readLine(buffer);
    if (!complete) throw new Error('The connection ended before the response completed.');
    return complete;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function endConversation(sessionId: string, token?: string) { await fetch(`/api/${token ? 'public/sessions' : 'conversations'}/${sessionId}`, { method: 'DELETE', keepalive: true, headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: token ? 'omit' : 'same-origin' }); }
