import { useEffect, useRef, useState } from 'react';
import type { ConversationSession } from '../../../shared/browserConversation';

type Status = 'idle' | 'starting' | 'recording' | 'paused' | 'saving' | 'saved' | 'error';
interface Startup { abort: AbortController; mic?: MediaStream; context?: AudioContext }
export function useConversationRecording(session: ConversationSession | null, onLimit: () => void) {
  const [status, setStatus] = useState<Status>('idle'); const [error, setError] = useState('');
  const sessionRef = useRef(session); sessionRef.current = session;
  const limit = useRef(onLimit); limit.current = onLimit;
  const capture = useRef<{ session: ConversationSession; context: AudioContext; destination: MediaStreamAudioDestinationNode; mic: MediaStream; recorder: MediaRecorder; chunks: Blob[]; blob?: Blob; timer?: ReturnType<typeof setTimeout>; done?: Promise<void>; saved: boolean }>();
  const startup = useRef<Startup>();
  const alive = useRef(true);
  const update = (value: Status, message = '') => { if (alive.current) { setStatus(value); setError(message); } };
  const endpoint = (value: ConversationSession) => `/api/${value.token ? 'public/sessions' : 'conversations'}/${value.session_id}/recording`;
  const headers = (value: ConversationSession): Record<string, string> => value.token ? { Authorization: `Bearer ${value.token}` } : {};
  const cancelStartup = () => {
    const attempt = startup.current; startup.current = undefined;
    if (!attempt) return;
    attempt.abort.abort(); attempt.mic?.getTracks().forEach(track => track.stop());
    if (attempt.context?.state !== 'closed') void attempt.context?.close().catch(() => {});
  };
  const finish = async (): Promise<void> => {
    cancelStartup();
    const value = capture.current; if (!value) return;
    if (value.done) return value.done;
    value.done = (async () => {
      clearTimeout(value.timer);
      if (value.recorder.state !== 'inactive') await new Promise<void>(resolve => { value.recorder.onstop = () => resolve(); value.recorder.stop(); });
      value.mic.getTracks().forEach(track => track.stop());
      await value.context.close().catch(() => {});
      value.blob ||= new Blob(value.chunks, { type: value.recorder.mimeType });
      value.chunks = [];
      if (!value.blob.size) { update('error', 'No audio was captured.'); return; }
      update('saving');
      const response = await fetch(endpoint(value.session), { method: 'POST', headers: { ...headers(value.session), 'Content-Type': value.blob.type.split(';')[0] }, body: value.blob, credentials: value.session.token ? 'omit' : 'same-origin' });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error?.message || 'Audio could not be saved. Retry before closing.'); }
      value.saved = true; value.blob = undefined; update('saved');
    })().catch(err => { value.done = undefined; update('error', err instanceof Error ? err.message : 'Recording upload failed. Retry saving.'); throw err; });
    return value.done;
  };
  const start = async () => {
    const opened = sessionRef.current; if (!opened?.recording_enabled) return true;
    const current = capture.current;
    if (current && current.session.session_id === opened.session_id) {
      if (current.recorder.state === 'paused') { current.recorder.resume(); current.mic.getAudioTracks().forEach(track => { track.enabled = true; }); update('recording'); }
      if (current.recorder.state === 'inactive') throw new Error('This recording has ended. Start a new conversation.');
      return true;
    }
    if (startup.current) throw new Error('Microphone is connecting.');
    const attempt: Startup = { abort: new AbortController() }; startup.current = attempt; update('starting');
    const isCancelled = () => attempt.abort.signal.aborted || !alive.current || sessionRef.current?.session_id !== opened.session_id;
    let mic: MediaStream | undefined; let context: AudioContext | undefined;
    try {
      if (!window.MediaRecorder || !window.AudioContext) throw new Error('Audio recording needs Chrome or Edge.');
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(value => MediaRecorder.isTypeSupported(value));
      if (!mimeType) throw new Error('This browser does not support conversation recording.');
      context = new AudioContext(); attempt.context = context; await context.resume();
      if (isCancelled()) throw new Error('Conversation closed.');
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      attempt.mic = mic;
      if (isCancelled()) throw new Error('Conversation closed.');
      const response = await fetch(endpoint(opened) + '/start', { method: 'POST', headers: { ...headers(opened), 'Content-Type': 'application/json' }, body: JSON.stringify({ notice_version: 'recording-v1' }), credentials: opened.token ? 'omit' : 'same-origin', signal: attempt.abort.signal });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error?.message || 'Recording could not start.'); }
      if (isCancelled()) throw new Error('Conversation closed.');
      const destination = context.createMediaStreamDestination(); context.createMediaStreamSource(mic).connect(destination);
      const recorder = new MediaRecorder(destination.stream, { mimeType, audioBitsPerSecond: 48000 });
      const value = { session: opened, context, destination, mic, recorder, chunks: [] as Blob[], saved: false, timer: undefined as ReturnType<typeof setTimeout> | undefined };
      capture.current = value;
      let bytes = 0;
      recorder.ondataavailable = event => { if (event.data.size) { value.chunks.push(event.data); bytes += event.data.size; if (bytes >= 11000000) { limit.current(); void finish().catch(() => {}); } } };
      recorder.onerror = () => { update('error', 'Audio capture failed. End the conversation to save available audio.'); limit.current(); };
      recorder.start(1000); value.timer = setTimeout(() => { limit.current(); void finish().catch(() => {}); }, 300000); update('recording');
      return true;
    } catch (err) { mic?.getTracks().forEach(track => track.stop()); if (context?.state !== 'closed') await context?.close().catch(() => {}); if (isCancelled()) return false; update('error', err instanceof Error ? err.message : 'Recording could not start.'); throw err; }
    finally { if (startup.current === attempt) startup.current = undefined; }
  };
  const attachPlayback = (audio: HTMLAudioElement) => {
    const value = capture.current; if (!value || value.context.state === 'closed') return;
    const source = value.context.createMediaElementSource(audio); source.connect(value.destination); source.connect(value.context.destination);
  };
  const pause = () => { const value = capture.current; if (value?.recorder.state === 'recording') { value.recorder.pause(); value.mic.getAudioTracks().forEach(track => { track.enabled = false; }); update('paused'); } };
  useEffect(() => { if (session?.session_id && capture.current?.session.session_id !== session.session_id) update('idle'); }, [session?.session_id]);
  const finishRef = useRef(finish); finishRef.current = finish;
  useEffect(() => { alive.current = true; return () => { alive.current = false; void finishRef.current().catch(() => {}); }; }, []);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (capture.current && !capture.current.saved) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
  return { status, error, start, pause, finish, attachPlayback };
}
