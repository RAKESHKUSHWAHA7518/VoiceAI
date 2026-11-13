import { TurnTiming } from '../../../../shared/voiceTiming';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { streamTurn, endConversation } from '../../utils/conversation';
import { useConversationRecording } from '../../hooks/useConversationRecording';
import { useContinuousVoice } from '../../hooks/useContinuousVoice';
import { SpeechQueue } from '../../../../shared/streamingSpeech';
import { EndCallGate } from '../../../../shared/endCall';
interface Session { session_id: string; token: string; greeting: string; agent_name: string; runtime_mode: 'demo' | 'live'; speech_output: string; recording_enabled?: boolean }
export function PublicWidget() {
  const [ended, setEnded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [input, setInput] = useState(''); const [partial, setPartial] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [readAloud, setReadAloud] = useState(true);
  const submitRef = useRef<(text: string, speechEnd?: number) => void>(() => {});
  const generation = useRef(0); const alive = useRef(true);
  const speechQueue = useRef<SpeechQueue>();
  const measured = useRef<TurnTiming>();
  const finishRef = useRef<() => Promise<void>>(async () => {});
  const finishing = useRef(false);
  const endGate = useRef<EndCallGate>(); endGate.current ||= new EndCallGate(() => { void finishRef.current(); });
  const recording = useConversationRecording(session, () => { voiceRef.current.pause(); setBusy(false); setEnded(true); });
  const recordingRef = useRef(recording); recordingRef.current = recording;
  const voice = useContinuousVoice('en-US', (text, speechEnd) => submitRef.current(text, speechEnd), () => { generation.current++; measured.current = undefined; endGate.current?.reset(); controller.current?.abort(); speechQueue.current?.cancel(); speechQueue.current = undefined; setBusy(false); setPartial(''); }, { sessionId: session?.session_id || '', enabled: session?.speech_output === 'cloud', token: session?.token }, { silenceMs: 600, onAudioStarted: () => measured.current?.audio(), onReplyFinished: () => endGate.current?.playbackFinished(), onStream: stream => recordingRef.current.attachStream(stream), onPlayback: audio => recordingRef.current.attachPlayback(audio) });
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
    const end = () => { alive.current = false; voiceRef.current.pause(); controller.current?.abort(); window.speechSynthesis?.cancel(); const old = sessionRef.current; void recordingRef.current.finish().catch(() => {}).finally(() => { if (old) void endConversation(old.session_id, old.token); }); };
    window.addEventListener('pagehide', end);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('pagehide', end); end(); };
  }, []);
  const send = async (text: string, speechEnd?: number) => {
    if (!session || ended || !text.trim()) return;
    endGate.current?.reset(); controller.current?.abort(); speechQueue.current?.cancel(); speechQueue.current = undefined; const token = ++generation.current; voice.thinking(); setInput(''); setBusy(true); setError(''); setPartial('');
    setMessages(previous => [...previous, { role: 'user', text }]);
    const request = new AbortController(); controller.current = request; let pending = ''; let streamedSpeech = false;
    const measurement = new TurnTiming(session, speechEnd, session.speech_output === 'cloud' && typeof AudioContext !== 'undefined'); measured.current = measurement;
    try {
      const result = await streamTurn(session.session_id, text, delta => { if (token === generation.current && alive.current) { measurement.text(); pending += delta; setPartial(pending); } }, request.signal, session.token, undefined, segment => {
        if (token !== generation.current || !alive.current || !readAloud || session.speech_output !== 'cloud') return;
        if (!speechQueue.current) { speechQueue.current = new SpeechQueue(); streamedSpeech = true; voice.streamReply(speechQueue.current); }
        speechQueue.current.push(segment);
      });
      if (token !== generation.current || !alive.current) return;
      measurement.complete(result.turn_id); setMessages(previous => [...previous, { role: 'assistant', text: result.output }]);
      (speechQueue.current as SpeechQueue | undefined)?.close();
      if (readAloud && !streamedSpeech) voice.speak(result.output); else if (!streamedSpeech) voice.recover(); if (result.end_call) { endGate.current?.request(); if (!readAloud) endGate.current?.playbackFinished(); }
    } catch (err) { if (token === generation.current && !request.signal.aborted && alive.current) { (speechQueue.current as SpeechQueue | undefined)?.cancel(); voice.cancelReply(); setError(err instanceof Error ? err.message : 'The response failed.'); voice.recover(); } }
    finally { if (token === generation.current && alive.current) { setPartial(''); setBusy(false); } }
  };
  submitRef.current = (text, speechEnd) => { void send(text, speechEnd); };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(input.trim()); };
  const finishConversation = async () => {
    if (finishing.current) return; finishing.current = true;
    voice.pause(); controller.current?.abort(); setEnded(true);
    try { await recording.finish(); if (sessionRef.current) await endConversation(sessionRef.current.session_id, sessionRef.current.token); sessionRef.current = null; setSession(null); setError(''); }
    catch { setEnded(false); setError('Could not save and end. Retry saving, then end the conversation again.'); }
    finally { finishing.current = false; }
  };
  finishRef.current = finishConversation;
  return <main className="public-voice-widget" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff', color: '#172139', colorScheme: 'light', font: '14px system-ui' }}>
    <header style={{ padding: 18, borderBottom: '1px solid #e9e9ef' }}><strong>{session?.agent_name || 'Connecting...'}</strong><p style={{ margin: '5px 0', fontSize: 12 }}>{session?.runtime_mode === 'live' ? 'Live model' : 'Demo preview'} · {session?.speech_output === 'cloud' ? 'Cloud voice' : 'Browser voice'}</p></header>
    <div style={{ padding: '12px 18px', background: '#f5f2ff' }}><button type="button" disabled={!session || ended} onClick={async () => { try { if (voice.active) { voice.pause(); recording.pause(); } else { if (!await recording.start()) return; voice.start(messages.length <= 1 ? session?.greeting : undefined); } } catch (err) { setError(err instanceof Error ? err.message : 'Recording could not start.'); } }} style={{ padding: 14, border: 0, borderRadius: 12, background: voice.active ? '#a75c7e' : '#6654d9', color: 'white', width: '100%' }}>{voice.active ? 'Pause conversation' : voice.phase === 'error' || voice.phase === 'paused' ? 'Resume conversation' : 'Start conversation'}</button><p aria-live="polite">{voice.partial || (voice.phase === 'speaking' ? (voice.active ? 'Agent speaking — you can interrupt' : 'Agent speaking') : voice.phase === 'listening' ? 'Listening — speak naturally' : voice.phase === 'thinking' ? 'Preparing your answer' : voice.phase === 'starting' ? 'Connecting microphone…' : 'Start once. Use headphones, then speak naturally.')}</p>{voice.error && <p role="alert">{voice.error}</p>}</div>
    <div style={{ padding: '8px 18px', fontSize: 12 }}><p>You are speaking with an AI. Conversations are saved to the agent owner's history.{session?.recording_enabled ? ' Starting the microphone records both voices for up to five minutes.' : ' Audio recording is unavailable in browser-only voice mode.'}</p>{session?.recording_enabled && <p role="status">{recording.status === 'recording' ? '🔴 Recording' : 'Audio: ' + recording.status}</p>}{recording.error && <p role="alert">{recording.error}<button onClick={() => void recording.finish().catch(() => {})}>Retry saving</button></p>}<button disabled={!session || recording.status === 'saving'} onClick={() => void finishConversation()}>End conversation and save</button></div>
    {ended && <p role="status" style={{ padding: '0 18px' }}>Conversation ended. Close and reopen the website widget to start again.</p>}<div role="log" aria-label="Conversation" style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
      {messages.map((message, index) => <div key={index} style={{ padding: 12, borderRadius: 10, background: message.role === 'user' ? '#efecff' : '#f5f6f9', marginBottom: 12, whiteSpace: 'pre-wrap' }}><strong>{message.role === 'user' ? 'You' : 'Agent'}</strong><p style={{ margin: '6px 0' }}>{message.text}</p></div>)}
      {partial && <p>{partial}</p>}{error && <p role="alert" style={{ color: '#b32632' }}>{error}</p>}
    </div>
    <form onSubmit={submit} style={{ display: 'grid', gap: 10, padding: 16, borderTop: '1px solid #e9e9ef' }}><label style={{ fontSize: 12 }}><input type="checkbox" checked={readAloud} onChange={event => setReadAloud(event.target.checked)} /> Read responses aloud</label><input aria-label="Your message" maxLength={4000} value={input} onChange={event => setInput(event.target.value)} placeholder="Type your question" style={{ padding: 12, borderRadius: 8, border: '1px solid #ccd1df' }} /><button disabled={!session || ended || busy || !input.trim()} style={{ padding: 12, border: 0, borderRadius: 8, background: '#6254d8', color: 'white' }}>{busy ? 'Responding...' : 'Send'}</button></form>
  </main>;
}


