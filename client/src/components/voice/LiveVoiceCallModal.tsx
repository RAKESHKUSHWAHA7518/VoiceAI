import { useState, useEffect, useRef } from 'react';
import type { Agent, PlaygroundTest } from '../../types';
import { IconMic } from '../common/Icons';
import { openConversation, openDemoConversation, streamTurn, endConversation, type ConversationSession } from '../../utils/conversation';
import { useContinuousVoice } from '../../hooks/useContinuousVoice';
import { useConversationRecording } from '../../hooks/useConversationRecording';
import { SpeechQueue } from '../../../../shared/streamingSpeech';
interface Props { isOpen: boolean; onClose: () => void; agent: Agent | null; onRunTest?: (input: string) => Promise<PlaygroundTest | undefined>; onViewAnalytics?: () => void; demo?: boolean; embedded?: boolean }
export function LiveVoiceCallModal({ isOpen, onClose, agent, demo = false, onViewAnalytics, embedded = false }: Props) {
  const [prepared, setPrepared] = useState(!embedded);
  const [restart, setRestart] = useState(0);
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [phase, setPhase] = useState<'connecting' | 'ready' | 'thinking' | 'speaking' | 'ended'>('connecting');
  const [input, setInput] = useState(''); const [partial, setPartial] = useState(''); const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [firstTextMs, setFirstTextMs] = useState<number | null>(null);
  const [firstAudioMs, setFirstAudioMs] = useState<number | null>(null);
  const turnTiming = useRef<{ start: number; text: boolean; audio: boolean }>();
  const speechQueue = useRef<SpeechQueue>();
  const sessionRef = useRef<ConversationSession | null>(null); const mounted = useRef(false);
  const generation = useRef(0); const request = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDivElement>(null); const submitRef = useRef<(text: string) => void>(() => {});
  const [speakerMode, setSpeakerMode] = useState(true);
  const interrupt = () => {
    generation.current++;
    request.current?.abort();
    request.current = null; speechQueue.current?.cancel(); speechQueue.current = undefined;
    turnTiming.current = undefined;
    voiceRef.current?.cancelReply();
    setPartial('');
    setPhase('ready');
    // Aborting the response cancels that exact server turn. A separate interrupt
    // request can arrive late and accidentally cancel the replacement turn.
  };
  const recording = useConversationRecording(session, () => { voiceRef.current.pause(); setPhase('ended'); });
  const recordingRef = useRef(recording); recordingRef.current = recording;
  const voice = useContinuousVoice(agent?.default_language || 'en-US', text => submitRef.current(text), interrupt, { sessionId: session?.session_id || '', enabled: session?.speech_output === 'cloud' }, { speakerMode, silenceMs: 600, onPlayback: audio => recordingRef.current.attachPlayback(audio), onAudioStarted: () => { const timing = turnTiming.current; if (timing && !timing.audio) { timing.audio = true; setFirstAudioMs(Math.round(performance.now() - timing.start)); } } });
  const voiceRef = useRef(voice); voiceRef.current = voice;
  const stop = () => { voiceRef.current.pause(); interrupt(); };
  const submit = async (text: string) => {
    if (!text.trim() || !sessionRef.current || phase === 'ended') return;
    interrupt(); voiceRef.current.thinking(); const token = generation.current; const controller = new AbortController(); request.current = controller;
    setError(''); setInput(''); setPhase('thinking'); setElapsed(null); setFirstTextMs(null); setFirstAudioMs(null);
    setMessages(previous => [...previous, { role: 'user', text }]);
    let pending = ''; const start = performance.now();
    turnTiming.current = { start, text: false, audio: false };
    let streamedSpeech = false;
    try {
      const result = await streamTurn(sessionRef.current.session_id, text, delta => { if (mounted.current && generation.current === token) { pending += delta; setPartial(pending); if (turnTiming.current && !turnTiming.current.text) { turnTiming.current.text = true; setFirstTextMs(Math.round(performance.now() - start)); } } }, controller.signal, sessionRef.current.token, undefined, segment => {
        if (!mounted.current || generation.current !== token || sessionRef.current?.speech_output !== 'cloud') return;
        if (!speechQueue.current) { speechQueue.current = new SpeechQueue(); streamedSpeech = true; voiceRef.current.streamReply(speechQueue.current); }
        speechQueue.current.push(segment);
      });
      if (!mounted.current || generation.current !== token) return;
      speechQueue.current?.close();
      setMessages(previous => [...previous, { role: 'assistant', text: result.output }]); setPartial(''); setElapsed(Math.round(performance.now() - start)); setPhase('ready'); if (!streamedSpeech) voiceRef.current.speak(result.output);
    } catch (err) { if (mounted.current && generation.current === token) { speechQueue.current?.cancel(); voiceRef.current.cancelReply(); setPhase('ready'); setPartial(''); setError(err instanceof Error ? err.message : 'Could not complete the message.'); voiceRef.current.recover(); } }
    finally { if (request.current === controller) request.current = null; }
  };
  submitRef.current = text => { void submit(text); };
  useEffect(() => {
    if (!isOpen || !agent || !prepared) return;
    mounted.current = true; const controller = new AbortController(); const previous = document.activeElement as HTMLElement | null;
    setSession(null); setMessages([]); setPhase('connecting'); setError(''); setElapsed(null);
    if (!embedded) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    (demo ? openDemoConversation(controller.signal) : openConversation(agent.id, controller.signal)).then(opened => {
      if (controller.signal.aborted || !mounted.current) { void endConversation(opened.session_id, opened.token); return; }
      sessionRef.current = opened; setSession(opened); setPhase('ready'); setMessages(opened.greeting ? [{ role: 'assistant', text: opened.greeting }] : []);
    }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setPhase('ended'); } });
    return () => { mounted.current = false; controller.abort(); stop(); const old = sessionRef.current; void recordingRef.current.finish().catch(() => {}).finally(() => { if (old) void endConversation(old.session_id, old.token); }); sessionRef.current = null; if (!embedded) previous?.focus(); };
  }, [isOpen, agent?.id, demo, restart, prepared]);
  if (!isOpen || !agent) return null;
  const micClick = async () => { setError(''); if (!prepared) { setPrepared(true); return; } try { if (voice.active) { voice.pause(); recording.pause(); } else { if (!await recording.start()) return; if (mounted.current) voice.start(messages.length <= 1 ? session?.greeting : undefined); } } catch (err) { setError(err instanceof Error ? err.message : 'Microphone could not start.'); } };
  const finishConversation = async () => { stop(); setPhase('ended'); try { await recording.finish(); if (sessionRef.current) { await endConversation(sessionRef.current.session_id, sessionRef.current.token); sessionRef.current = null; } } catch {} };
  const requestClose = async () => { stop(); try { await recording.finish(); onClose(); } catch { setError('Recording could not be saved. Retry saving before closing.'); } };
  const status = !prepared ? 'Connect a test, then start the microphone' : phase === 'ended' ? 'Conversation ended' : voice.phase === 'starting' ? 'Connecting microphone…' : voice.phase === 'listening' ? 'Listening — speak naturally' : voice.phase === 'thinking' ? 'Preparing your answer…' : voice.phase === 'speaking' ? agent.name + (speakerMode ? ' is speaking' : ' is speaking — you can interrupt') : voice.phase === 'error' ? 'Conversation needs attention' : 'Start once, then speak naturally';
  return <div className={embedded ? 'agent-call-inline' : 'modal-overlay workflow-overlay'}><div className="voice-test-shell" role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby="voice-test-title" ref={dialog} onKeyDown={event => {
    if (embedded) return;
    if (event.key === 'Escape') void requestClose();
    if (event.key === 'Tab') { const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') || []); const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}>
    <header className="workflow-header"><div><span className="workflow-eyebrow">{embedded ? 'TEST YOUR AGENT' : 'VOICE PLAYGROUND'}</span><h2 id="voice-test-title">{embedded ? 'Live conversation' : 'Talk to ' + agent.name}</h2><p>{!prepared ? 'Your saved agent settings, ready to test' : !session ? 'Connecting test session…' : (session.runtime_mode === 'live' ? 'Live language model' : 'Free demo') + ' · ' + (session.speech_output === 'cloud' ? 'Deepgram microphone · Cartesia voice' : 'Browser microphone and voice')}</p></div>{!embedded && <button className="workflow-close" aria-label="Close voice test" disabled={recording.status === 'saving' || recording.status === 'starting'} onClick={() => void requestClose()}>×</button>}</header>
    <div className="voice-test-layout"><section className="voice-control-panel">
      <div className="voice-agent-orb">{agent.name.slice(0, 1)}</div><h3>{agent.name}</h3><p>{agent.role}</p>
      <button className={`voice-mic-button ${voice.active ? 'is-listening' : ''}`} onClick={micClick} disabled={(prepared && !session) || phase === 'ended'} aria-label={!prepared ? 'Connect agent test' : voice.active ? 'Pause conversation microphone' : 'Start conversation microphone'}><IconMic size={34} /></button>
      <strong className="voice-status" role="status">{status}</strong>
      <div style={{ display: 'flex', gap: '6px', margin: '6px 0', justifyContent: 'center' }}>
        <button type="button" className={`btn btn-sm ${speakerMode ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSpeakerMode(true)} title="Speaker mode stops speaker sound from cutting off the agent">🔊 Speaker (Echo-Safe)</button>
        <button type="button" className={`btn btn-sm ${!speakerMode ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSpeakerMode(false)} title="Use with headphones for hands-free barge-in">🎧 Headphones (Barge-in)</button>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={micClick} disabled={(prepared && !session) || phase === 'ended'}>{!prepared ? 'Connect test' : voice.active ? 'Pause conversation' : voice.phase === 'paused' || voice.phase === 'error' ? 'Resume conversation' : 'Start conversation'}</button>
        {voice.phase === 'speaking' && <button className="btn btn-danger" onClick={interrupt}>✋ Interrupt</button>}
      </div>
      <p className="voice-mic-help">{speakerMode ? 'Speaker mode: agent speaks smoothly without interruption from laptop speakers. Use the Interrupt button or tap the mic to speak.' : 'Headphones mode: agent can be interrupted by speaking over it. Wear headphones to avoid echo.'}</p>
      <small>{!prepared ? 'No microphone or provider request starts until you connect and begin a conversation.' : session?.speech_output === 'cloud' ? 'Deepgram streaming · Allow microphone access in Chrome.' : 'Browser speech preview · Recognition and interruption depend on browser support.'}</small>{voice.detail && <p className="voice-mic-help" role="status">{voice.detail}</p>}
      {voice.error && <p className="workflow-error" role="alert">{voice.error}</p>}
    </section><section className="voice-transcript-panel"><div className="voice-transcript-heading"><h3>Conversation</h3><span>{demo ? 'Guest preview' : 'Saved to history'}</span></div>
      <div className="voice-transcript" role="log" aria-label="Conversation transcript">{messages.map((message, index) => <div className={`voice-message ${message.role}`} key={index}><strong>{message.role === 'user' ? 'You' : agent.name}</strong><p>{message.text}</p></div>)}{(voice.partial || partial) && <div className="voice-message pending"><p>{voice.partial || partial}</p></div>}</div>
      {error && <p className="workflow-error" role="alert">{error}</p>}
      <form className="voice-text-form" onSubmit={event => { event.preventDefault(); void submit(input); }}><input className="form-input" aria-label="Your message" placeholder="Or type a message…" maxLength={4000} value={input} onChange={event => setInput(event.target.value)} /><button className="btn btn-primary" disabled={!session || !input.trim() || phase === 'thinking' || phase === 'ended'}>Send</button></form>
      {(firstTextMs !== null || firstAudioMs !== null || elapsed !== null) && <small className="voice-timing">{firstTextMs !== null && <>First text {firstTextMs} ms · </>}{firstAudioMs !== null && <>First audio {firstAudioMs} ms · </>}{elapsed !== null && <>Answer complete {elapsed} ms · </>}Measured from turn submission; excludes speech recognition.</small>}
    </section></div>
    {session?.recording_enabled && <p role="status" style={{ padding: '0 24px' }}>{recording.status === 'recording' ? '🔴 Recording both voices' : recording.status === 'saving' ? 'Saving recording… keep this window open' : recording.status === 'saved' ? 'Recording saved to History' : recording.status === 'paused' ? 'Recording paused' : 'Recording available when you start the microphone'}{recording.error && <span role="alert"> · {recording.error} <button className="btn btn-secondary" onClick={() => void recording.finish().catch(() => {})}>Retry saving</button></span>}</p>}
    <footer className="workflow-footer"><p>{session?.speech_output === 'cloud' ? 'Live audio goes to Deepgram; reply text goes to Cartesia. Uses provider credits. ' : ''}{!prepared ? 'Connect the test to load voice and recording availability. ' : session?.recording_enabled ? 'Starting the microphone records your voice and the AI voice for your private conversation history (up to five minutes).' : 'Audio is not stored for browser-only voice.'}{demo ? ' Sign in to save your own conversations.' : ' Your transcript is private to your workspace.'}</p><div>{embedded && prepared && <button className="btn btn-primary" disabled={recording.status === 'saving'} onClick={async () => { try { stop(); setPhase('ended'); await recording.finish(); setRestart(value => value + 1); } catch {} }}>New test</button>}{onViewAnalytics && !demo && <button className="btn btn-secondary" onClick={onViewAnalytics}>View history</button>}<button className="btn btn-danger" disabled={!session || recording.status === 'saving' || phase === 'ended'} onClick={() => void finishConversation()}>End conversation</button></div></footer>
  </div></div>;
}
