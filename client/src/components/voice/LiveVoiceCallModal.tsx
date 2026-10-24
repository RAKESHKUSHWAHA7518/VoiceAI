import { useState, useEffect, useRef } from 'react';
import type { Agent, PlaygroundTest } from '../../types';
import { IconMic } from '../common/Icons';
import { openConversation, openDemoConversation, streamTurn, endConversation, type ConversationSession } from '../../utils/conversation';
import { useContinuousVoice } from '../../hooks/useContinuousVoice';
interface Props { isOpen: boolean; onClose: () => void; agent: Agent | null; onRunTest?: (input: string) => Promise<PlaygroundTest | undefined>; onViewAnalytics?: () => void; demo?: boolean }
export function LiveVoiceCallModal({ isOpen, onClose, agent, demo = false, onViewAnalytics }: Props) {
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [phase, setPhase] = useState<'connecting' | 'ready' | 'thinking' | 'speaking' | 'ended'>('connecting');
  const [input, setInput] = useState(''); const [partial, setPartial] = useState(''); const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const sessionRef = useRef<ConversationSession | null>(null); const mounted = useRef(false);
  const generation = useRef(0); const request = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDivElement>(null); const submitRef = useRef<(text: string) => void>(() => {});
  const interrupt = () => { generation.current++; request.current?.abort(); setPartial(''); setPhase('ready'); };
  const voice = useContinuousVoice(agent?.default_language || 'en-US', text => submitRef.current(text), interrupt, { sessionId: session?.session_id || '', enabled: session?.speech_output === 'cloud' });
  const voiceRef = useRef(voice); voiceRef.current = voice;
  const stop = () => { voiceRef.current.pause(); interrupt(); };
  const submit = async (text: string) => {
    if (!text.trim() || !sessionRef.current || phase === 'ended') return;
    interrupt(); voiceRef.current.thinking(); const token = generation.current; const controller = new AbortController(); request.current = controller;
    setError(''); setInput(''); setPhase('thinking'); setElapsed(null);
    setMessages(previous => [...previous, { role: 'user', text }]);
    let pending = ''; const start = performance.now();
    try {
      const result = await streamTurn(sessionRef.current.session_id, text, delta => { if (mounted.current && generation.current === token) { pending += delta; setPartial(pending); } }, controller.signal, sessionRef.current.token);
      if (!mounted.current || generation.current !== token) return;
      setMessages(previous => [...previous, { role: 'assistant', text: result.output }]); setPartial(''); setElapsed(Math.round(performance.now() - start)); setPhase('ready'); voiceRef.current.speak(result.output);
    } catch (err) { if (mounted.current && generation.current === token) { setPhase('ready'); setPartial(''); setError(err instanceof Error ? err.message : 'Could not complete the message.'); voiceRef.current.recover(); } }
  };
  submitRef.current = text => { void submit(text); };
  useEffect(() => {
    if (!isOpen || !agent) return;
    mounted.current = true; const controller = new AbortController(); const previous = document.activeElement as HTMLElement | null;
    setSession(null); setMessages([]); setPhase('connecting'); setError(''); setElapsed(null);
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    (demo ? openDemoConversation(controller.signal) : openConversation(agent.id, controller.signal)).then(opened => {
      if (controller.signal.aborted || !mounted.current) { void endConversation(opened.session_id, opened.token); return; }
      sessionRef.current = opened; setSession(opened); setPhase('ready'); setMessages(opened.greeting ? [{ role: 'assistant', text: opened.greeting }] : []);
    }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setPhase('ended'); } });
    return () => { mounted.current = false; controller.abort(); stop(); if (sessionRef.current) void endConversation(sessionRef.current.session_id, sessionRef.current.token); sessionRef.current = null; previous?.focus(); };
  }, [isOpen, agent?.id, demo]);
  if (!isOpen || !agent) return null;
  const micClick = () => { setError(''); if (voice.active) voice.pause(); else voice.start(messages.length <= 1 ? session?.greeting : undefined); };
  const status = phase === 'ended' ? 'Conversation ended' : voice.phase === 'starting' ? 'Connecting microphone…' : voice.phase === 'listening' ? 'Listening — speak naturally' : voice.phase === 'thinking' ? 'Preparing your answer — you can interrupt' : voice.phase === 'speaking' ? agent.name + (voice.active ? ' is speaking — you can interrupt' : ' is speaking') : voice.phase === 'error' ? 'Conversation needs attention' : 'Start once, then speak naturally';
  return <div className="modal-overlay workflow-overlay"><div className="voice-test-shell" role="dialog" aria-modal="true" aria-labelledby="voice-test-title" ref={dialog} onKeyDown={event => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'Tab') { const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') || []); const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}>
    <header className="workflow-header"><div><span className="workflow-eyebrow">VOICE PLAYGROUND</span><h2 id="voice-test-title">Talk to {agent.name}</h2><p>{session?.runtime_mode === 'live' ? 'Live language model' : 'Free demo'} · {session?.speech_output === 'cloud' ? 'Deepgram microphone · Cartesia voice' : 'Browser microphone and voice'}</p></div><button className="workflow-close" aria-label="Close voice test" onClick={onClose}>×</button></header>
    <div className="voice-test-layout"><section className="voice-control-panel">
      <div className="voice-agent-orb">{agent.name.slice(0, 1)}</div><h3>{agent.name}</h3><p>{agent.role}</p>
      <button className={`voice-mic-button ${voice.active ? 'is-listening' : ''}`} onClick={micClick} disabled={!session || phase === 'ended'} aria-label={voice.active ? 'Pause conversation microphone' : 'Start conversation microphone'}><IconMic size={34} /></button>
      <strong className="voice-status" role="status">{status}</strong>
      <button className="btn btn-primary" onClick={micClick} disabled={!session || phase === 'ended'}>{voice.active ? 'Pause conversation' : voice.phase === 'paused' || voice.phase === 'error' ? 'Resume conversation' : 'Start conversation'}</button>
      <p className="voice-mic-help">Start once. The agent listens after every reply. Speak over a reply to interrupt. Use headphones to reduce playback echo.</p>
      <small>{session?.speech_output === 'cloud' ? 'Deepgram streaming · Allow microphone access in Chrome. Use headphones for interruption testing.' : 'Browser speech preview · Recognition and interruption depend on browser support.'}</small>{voice.detail && <p className="voice-mic-help" role="status">{voice.detail}</p>}
      {voice.error && <p className="workflow-error" role="alert">{voice.error}</p>}
    </section><section className="voice-transcript-panel"><div className="voice-transcript-heading"><h3>Conversation</h3><span>{demo ? 'Guest preview' : 'Saved to history'}</span></div>
      <div className="voice-transcript" role="log" aria-label="Conversation transcript">{messages.map((message, index) => <div className={`voice-message ${message.role}`} key={index}><strong>{message.role === 'user' ? 'You' : agent.name}</strong><p>{message.text}</p></div>)}{(voice.partial || partial) && <div className="voice-message pending"><p>{voice.partial || partial}</p></div>}</div>
      {error && <p className="workflow-error" role="alert">{error}</p>}
      <form className="voice-text-form" onSubmit={event => { event.preventDefault(); void submit(input); }}><input className="form-input" aria-label="Your message" placeholder="Or type a message…" maxLength={4000} value={input} onChange={event => setInput(event.target.value)} /><button className="btn btn-primary" disabled={!session || !input.trim() || phase === 'thinking' || phase === 'ended'}>Send</button></form>
      {elapsed !== null && <small className="voice-timing">Response received in {elapsed} ms · excludes speech recognition and playback</small>}
    </section></div>
    <footer className="workflow-footer"><p>{session?.speech_output === 'cloud' ? 'Live audio goes to Deepgram; reply text goes to Cartesia. Uses provider credits. ' : ''}No audio recording is stored by this app.{demo ? ' Sign in to save your own conversations.' : ' Your transcript is private to your workspace.'}</p><div>{onViewAnalytics && !demo && <button className="btn btn-secondary" onClick={onViewAnalytics}>View history</button>}<button className="btn btn-danger" onClick={() => { stop(); setPhase('ended'); if (sessionRef.current) { void endConversation(sessionRef.current.session_id, sessionRef.current.token); sessionRef.current = null; } }}>End conversation</button></div></footer>
  </div></div>;
}
