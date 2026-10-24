import { speechSegments } from '../../../shared/speechSegments';
// Provider keys never leave the backend. The websocket ticket is single-use and session-bound.
export class DeepgramRecognition {
 startupTimeout = 30000; connectionLabel = 'Microphone connected to Deepgram';
 private stage = 'Waiting for Chrome microphone permission';
 onprogress: ((detail: string) => void) | null = null;
 startupMessage() { return this.stage + '. Check the microphone permission icon beside the address bar, then resume.'; }
 private progress(detail: string) { this.stage = detail; this.onprogress?.(detail); }
 lang = 'en'; continuous = true; interimResults = true;
 onstart: (() => void) | null = null; onend: (() => void) | null = null;
 onerror: ((event: { error: string; message?: string }) => void) | null = null;
 onresult: ((event: unknown) => void) | null = null;
 private socket?: WebSocket; private recorder?: MediaRecorder; private stream?: MediaStream;
 private aborter = new AbortController(); private ended = false;
 constructor(private sessionId: string) {}
 start() { void this.connect(); }
 private fail(message: string) { if (this.ended) return; this.onerror?.({ error: 'network', message }); this.abort(); }
 private async connect() {
  try {
   if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('This browser cannot capture microphone audio. Try Chrome or Edge.');
   const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
   if (!mimeType) throw new Error('This browser does not support the streaming microphone format. Try Chrome or Edge.');
   this.progress('Waiting for Chrome microphone permission');
   const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
   if (this.ended) { stream.getTracks().forEach(track => track.stop()); return; } this.stream = stream;
   this.progress('Microphone allowed — authorizing speech connection');
   const response = await fetch('/api/conversations/' + this.sessionId + '/speech-ticket', { method: 'POST', signal: this.aborter.signal });
   const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || 'Could not start Deepgram.');
   if (this.ended) return;
   this.progress('Microphone allowed — connecting to Deepgram');
   const socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/speech?ticket=' + encodeURIComponent(data.ticket)); this.socket = socket;
   socket.onmessage = event => {
    if (this.ended) return;
    const message = JSON.parse(event.data);
    if (message.type === 'error') { this.fail(message.message); return; }
    if (message.type === 'ready') {
     const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 }); this.recorder = recorder;
     let pending = Promise.resolve();
     recorder.ondataavailable = event => { if (!event.data.size) return; pending = pending.then(async () => { const bytes = await event.data.arrayBuffer(); if (!this.ended && socket.readyState === WebSocket.OPEN) { if (socket.bufferedAmount > 1000000) { this.fail('Microphone upload cannot keep up. Check your connection.'); return; } socket.send(bytes); } }).catch(() => this.fail('Microphone audio could not be sent.')); };
     recorder.onerror = () => this.fail('Microphone recording failed.'); recorder.start(250); this.progress('Microphone connected — audio is streaming to Deepgram'); this.onstart?.();
    }
    if (message.type === 'transcript' && message.text) { const result: any = [{ transcript: message.text }]; result.isFinal = message.final; this.onresult?.({ resultIndex: 0, results: [result] }); }
   };
   socket.onerror = () => this.fail('The Deepgram stream could not connect. Check your connection and resume.');
   socket.onclose = () => { if (!this.ended) { this.cleanup(); this.onend?.(); } };
  } catch (error) { if (!this.ended) { const name = error instanceof Error ? error.name : ''; this.fail(name === 'NotAllowedError' ? 'Microphone access is blocked. Allow the microphone for this site in Chrome and Windows privacy settings, then resume.' : name === 'NotFoundError' ? 'No microphone was found. Connect a microphone and resume.' : name === 'NotReadableError' ? 'Chrome cannot open the microphone. Check Windows microphone access and close other apps using the device.' : error instanceof Error ? error.message : 'Could not start microphone audio.'); } }
 }
 private cleanup() { this.ended = true; this.aborter.abort(); if (this.recorder?.state === 'recording') this.recorder.stop(); this.stream?.getTracks().forEach(track => track.stop()); this.socket?.close(); }
 abort() { this.cleanup(); }
}
export class CartesiaSynthesis {
 private request?: AbortController; private audio?: HTMLAudioElement; private url?: string; private generation = 0;
 private releasePlayback?: () => void;
 constructor(private sessionId: () => string, private token: () => string | undefined = () => undefined, private onPlayback: (audio: HTMLAudioElement) => void = () => {}) {}
 cancel() { this.generation++; this.request?.abort(); this.audio?.pause(); this.audio = undefined; this.releasePlayback?.(); this.releasePlayback = undefined; if (this.url) URL.revokeObjectURL(this.url); this.url = undefined; }
 speak(speech: SpeechSynthesisUtterance) {
  this.cancel(); const generation = this.generation; const request = new AbortController(); this.request = request;
  void (async () => {
   try {
    const chunks = speechSegments(speech.text);
    for (let index = 0; index < chunks.length; index++) {
     if (generation !== this.generation) return;
     const response = await fetch('/api/' + (this.token() ? 'public/sessions/' : 'conversations/') + this.sessionId() + '/speak', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token() ? { Authorization: 'Bearer ' + this.token() } : {}) }, credentials: this.token() ? 'omit' : 'same-origin', body: JSON.stringify({ text: speech.text, chunk_index: index }), signal: request.signal });
     if (!response.ok) { const error = await response.json(); throw new Error(error.error?.message || 'Cartesia voice failed.'); }
     const blob = await response.blob(); if (generation !== this.generation) return;
     this.url = URL.createObjectURL(blob); const audio = new Audio(this.url); this.audio = audio; this.onPlayback(audio);
     await new Promise<void>((resolve, reject) => {
      this.releasePlayback = resolve; audio.onended = () => resolve(); audio.onerror = () => reject(new Error('Audio playback failed. Check the browser sound setting.'));
      audio.play().catch(reject);
     });
     if (generation !== this.generation) return;
     this.releasePlayback = undefined; audio.onended = audio.onerror = null; this.audio = undefined;
     URL.revokeObjectURL(this.url); this.url = undefined;
    }
    if (generation === this.generation) { this.cancel(); speech.onend?.(new Event('end') as SpeechSynthesisEvent); }
   } catch (error) {
    if (generation === this.generation && !request.signal.aborted) { this.cancel(); speech.onerror?.({ message: error instanceof Error ? error.message : 'Voice playback failed.' } as unknown as SpeechSynthesisErrorEvent); }
   }
  })();
 }
}
