import { useEffect, useRef, useState, type FormEvent } from 'react';
import { streamTurn, endConversation } from '../../utils/conversation';
import { useContinuousVoice } from '../../hooks/useContinuousVoice';
interface Session { session_id: string; token: string; greeting: string; agent_name: string; runtime_mode: string }
export function PublicWidget() {
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [input, setInput] = useState(''); const [partial, setPartial] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [readAloud, setReadAloud] = useState(true);
  const submitRef = useRef<(text: string) => void>(() => {});
  const generation = useRef(0); const alive = useRef(true);
  const voice = useContinuousVoice('en-US', text => submitRef.current(text), () => { generation.current++; controller.current?.abort(); setBusy(false); setPartial(''); });
  const voiceRef = useRef(voice); voiceRef.current = voice;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    const parentOrigin = new URLSearchParams(location.search).get('parentOrigin');
    const deployment = location.pathname.split('/').pop();
    if (!parentOrigin || window.parent === window) { setError('Open this conversation using the website widget button.'); return; }
    try { if (new URL(parentOrigin).origin !== parentOrigin) throw new Error(); } catch { setError('Invalid website origin.'); return; }
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== parentOrigin) return;
      if (event.data?.type === 'voiceai:error') setError(String(event.data.message).slice(0, 300));
      if (event.data?.type === 'voiceai:session' && event.data.deployment === deployment && !sessionRef.current) {
        const opened = event.data.session;
        if (typeof opened.session_id !== 'string' || typeof opened.token !== 'string' || typeof opened.greeting !== 'string') return;
        sessionRef.current = opened; setSession(opened); setMessages(opened.greeting ? [{ role: 'assistant', text: opened.greeting }] : []);
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'voiceai:ready' }, parentOrigin);
    const end = () => { alive.current = false; voiceRef.current.pause(); controller.current?.abort(); window.speechSynthesis?.cancel(); if (sessionRef.current) void endConversation(sessionRef.current.session_id, sessionRef.current.token); };
    window.addEventListener('pagehide', end);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('pagehide', end); end(); };
  }, []);
  const send = async (text: string) => {
    if (!session || !text.trim()) return;
    controller.current?.abort(); const token = ++generation.current; voice.thinking(); setInput(''); setBusy(true); setError(''); setPartial('');
    setMessages(previous => [...previous, { role: 'user', text }]);
    const request = new AbortController(); controller.current = request; let pending = '';
    try {
      const result = await streamTurn(session.session_id, text, delta => { if (token === generation.current && alive.current) { pending += delta; setPartial(pending); } }, request.signal, session.token);
      if (token !== generation.current || !alive.current) return;
      setMessages(previous => [...previous, { role: 'assistant', text: result.output }]);
      if (readAloud) voice.speak(result.output); else voice.recover();
    } catch (err) { if (!request.signal.aborted && alive.current) { setError(err instanceof Error ? err.message : 'The response failed.'); voice.recover(); } }
    finally { if (token === generation.current && alive.current) { setPartial(''); setBusy(false); } }
  };
  submitRef.current = text => { void send(text); };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(input.trim()); };
  return <main className="public-voice-widget" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff', color: '#172139', colorScheme: 'light', font: '14px system-ui' }}>
    <header style={{ padding: 18, borderBottom: '1px solid #e9e9ef' }}><strong>{session?.agent_name || 'Connecting...'}</strong><p style={{ margin: '5px 0', fontSize: 12 }}>{session?.runtime_mode === 'live' ? 'Live model' : 'Demo preview'} · Browser voice</p></header>
    <div style={{ padding: '12px 18px', background: '#f5f2ff' }}><button type="button" disabled={!session} onClick={() => voice.active ? voice.pause() : voice.start(messages.length <= 1 ? session?.greeting : undefined)} style={{ padding: 14, border: 0, borderRadius: 12, background: voice.active ? '#a75c7e' : '#6654d9', color: 'white', width: '100%' }}>{voice.active ? 'Pause conversation' : voice.phase === 'error' || voice.phase === 'paused' ? 'Resume conversation' : 'Start conversation'}</button><p aria-live="polite">{voice.partial || (voice.phase === 'speaking' ? (voice.active ? 'Agent speaking — you can interrupt' : 'Agent speaking') : voice.phase === 'listening' ? 'Listening — speak naturally' : voice.phase === 'thinking' ? 'Preparing your answer' : voice.phase === 'starting' ? 'Connecting microphone…' : 'Start once. Use headphones, then speak naturally.')}</p>{voice.error && <p role="alert">{voice.error}</p>}</div>
    <div role="log" aria-label="Conversation" style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
      {messages.map((message, index) => <div key={index} style={{ padding: 12, borderRadius: 10, background: message.role === 'user' ? '#efecff' : '#f5f6f9', marginBottom: 12, whiteSpace: 'pre-wrap' }}><strong>{message.role === 'user' ? 'You' : 'Agent'}</strong><p style={{ margin: '6px 0' }}>{message.text}</p></div>)}
      {partial && <p>{partial}</p>}{error && <p role="alert" style={{ color: '#b32632' }}>{error}</p>}
    </div>
    <form onSubmit={submit} style={{ display: 'grid', gap: 10, padding: 16, borderTop: '1px solid #e9e9ef' }}><label style={{ fontSize: 12 }}><input type="checkbox" checked={readAloud} onChange={event => setReadAloud(event.target.checked)} /> Read responses with browser voice</label><input aria-label="Your message" maxLength={4000} value={input} onChange={event => setInput(event.target.value)} placeholder="Type your question" style={{ padding: 12, borderRadius: 8, border: '1px solid #ccd1df' }} /><button disabled={!session || busy || !input.trim()} style={{ padding: 12, border: 0, borderRadius: 8, background: '#6254d8', color: 'white' }}>{busy ? 'Responding...' : 'Send'}</button></form>
  </main>;
}


