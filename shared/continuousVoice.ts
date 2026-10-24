// Browser-independent conversation lifecycle, with injectable speech APIs for tests.
export type VoicePhase = 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';
export interface VoiceState { phase: VoicePhase; active: boolean; partial: string; error: string; detail?: string }
export interface VoiceDependencies {
  recognition: () => any;
  utterance: (text: string) => any;
  synthesis: { cancel(): void; speak(value: any): void };
  changed: (state: VoiceState) => void;
  text: (text: string) => void;
  interrupt: () => void;
  playbackStarted?: () => void;
}
export interface VoiceOptions { silenceMs?: number; speakerMode?: boolean }
export class ContinuousVoice {
  state: VoiceState = { phase: 'idle', active: false, partial: '', error: '' };
  private engine: any; private speech: any; private epoch = 0; private playback = 0;
  private startup?: ReturnType<typeof setTimeout>; private retry?: ReturnType<typeof setTimeout>;
  private endpoint?: ReturnType<typeof setTimeout>; private watchdog?: ReturnType<typeof setTimeout>;
  private finals = ''; private latest = ''; private spoken = ''; private restarts = 0;
  private greeting = '';
  private connectedAt = 0; private echoUntil = 0;
  private silenceMs: number;
  private speakerMode: boolean;
  private bargeCandidate = 0;
  private bargeLast = 0;
  constructor(private deps: VoiceDependencies, private language: string, options: VoiceOptions = {}) {
    const testRuntime = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === 'test';
    this.silenceMs = options.silenceMs ?? (testRuntime ? 750 : 1200);
    this.speakerMode = options.speakerMode ?? false;
  }
  setSpeakerMode(enabled: boolean) { this.speakerMode = enabled; }
  private update(patch: Partial<VoiceState>) { this.state = { ...this.state, ...patch }; this.deps.changed({ ...this.state }); }
  private clearTimers() { clearTimeout(this.startup); clearTimeout(this.retry); clearTimeout(this.endpoint); clearTimeout(this.watchdog); }
  private silence() { this.playback++; this.speech = null; clearTimeout(this.watchdog); this.deps.synthesis.cancel(); }
  private disconnect() { const old = this.engine; this.engine = null; if (old) { old.onstart = old.onend = old.onerror = old.onresult = old.onprogress = old.onutteranceend = null; try { old.abort(); } catch {} } }
  pause() { this.epoch++; this.clearTimers(); this.disconnect(); this.silence(); this.finals = this.latest = ''; this.deps.interrupt(); this.update({ phase: 'paused', active: false, partial: '', detail: '' }); }
  dispose() { this.pause(); }
  private fail(error: string) { this.pause(); this.update({ phase: 'error', error }); }
  start(greeting = '') {
    this.pause(); this.greeting = greeting; this.restarts = 0;
    this.update({ phase: 'starting', active: true, error: '' }); this.connect();
  }
  private connect() {
    if (!this.state.active) return;
    const token = this.epoch;
    try {
      const engine = this.deps.recognition(); this.engine = engine;
      engine.lang = this.language; engine.continuous = true; engine.interimResults = true;
      engine.onprogress = (detail: string) => { if (token === this.epoch && this.state.active) this.update({ detail }); };
      engine.onutteranceend = () => { if (token === this.epoch && this.state.active && !this.latest.trim()) this.flush(); };
      engine.onstart = () => {
        if (token !== this.epoch) return;
        clearTimeout(this.startup);
        this.update({ detail: engine.connectionLabel || 'Microphone connected' });
        this.connectedAt = Date.now();
        if (this.greeting) { const greeting = this.greeting; this.greeting = ''; this.speak(greeting); }
        else if (this.state.phase === 'starting') this.update({ phase: 'listening' });
      };
      engine.onresult = (event: any) => {
        if (token !== this.epoch || !this.state.active) return;
        let interim = ''; let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = String(event.results[i][0].transcript).trim();
          if (event.results[i].isFinal) final += text + ' '; else interim += text + ' ';
        }
        const incoming = (final + interim).trim(); if (!incoming) return;
        // Suppress recognizable playback echo with phonetic and word overlap detection
        const normalize = (text: string) => text.toLowerCase()
          .replace(/\b(i'm|im)\b/g, 'i am')
          .replace(/\b(you're|youre)\b/g, 'you are')
          .replace(/\b(it's|its)\b/g, 'it is')
          .replace(/\b(don't|dont)\b/g, 'do not')
          .replace(/\b(can't|cant)\b/g, 'cannot')
          .replace(/[^\p{L}\p{N}\s]/gu, '')
          .replace(/\s+/g, ' ')
          .trim();
        const isSpeaking = this.state.phase === 'speaking' || Date.now() < this.echoUntil;
        if (this.spoken && isSpeaking) {
          const spokenNorm = normalize(this.spoken);
          const incomingNorm = normalize(incoming);
          if (spokenNorm.includes(incomingNorm)) return;
          const incomingWords = incomingNorm.split(' ').filter(Boolean);
          if (incomingWords.length > 0) {
            const spokenWords = new Set(spokenNorm.split(' ').filter(Boolean));
            const matches = incomingWords.filter(w => spokenWords.has(w)).length;
            if (matches / incomingWords.length >= 0.5) return;
          }
          if (this.speakerMode && this.state.phase === 'speaking') return;
        }
        this.restarts = 0;
        if (this.state.phase === 'speaking') {
          const words = incoming.split(/\s+/);
          if (/^(um|uh|hmm|ah)$/i.test(incoming)) return;
          // Ignore isolated interim noise; a finalized phrase or sustained speech can barge in.
          if (!final) {
            if (!this.bargeCandidate || Date.now() - this.bargeLast > 500) this.bargeCandidate = Date.now();
            this.bargeLast = Date.now();
            if (words.length < 2 || Date.now() - this.bargeCandidate < 250) return;
          } else if (words.length < 2 && !/^(stop|cancel|wait|no)$/i.test(incoming)) return;
          this.bargeCandidate = 0;
          this.silence();
          this.deps.interrupt();
          this.update({ phase: 'listening' });
        }
        this.finals += final; this.latest = interim; this.update({ partial: (this.finals + interim).trim() });
        clearTimeout(this.endpoint);
        // Send only finalized words; interim words are not safe to commit.
        if (!interim && this.finals.trim()) this.endpoint = setTimeout(() => this.flush(), this.silenceMs);
      };
      engine.onerror = (event: any) => {
        if (token !== this.epoch) return;
        if (event.error === 'no-speech') return; // Normal silence; onend reconnects.
        this.fail(event.message || (event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'Microphone access was denied. Allow it in browser settings, then resume.' : 'Browser speech recognition is unavailable. Try Chrome or Edge, then resume the conversation.'));
      };
      engine.onend = () => {
        if (token !== this.epoch || !this.state.active) return;
        clearTimeout(this.startup); this.engine = null;
        if (Date.now() - this.connectedAt > 3000) this.restarts = 0;
        if (this.finals.trim()) this.flush(); else if (this.latest.trim()) this.update({ partial: 'Please repeat that; the browser did not finalize your words.' });
        this.latest = '';
        if (++this.restarts > 6) { this.fail('Speech recognition repeatedly disconnected. Check the microphone and browser, then resume.'); return; }
        this.retry = setTimeout(() => this.connect(), Math.min(250 * this.restarts, 1500));
      };
      engine.start();
      this.startup = setTimeout(() => { if (token === this.epoch) this.fail(engine.startupMessage?.() || 'The microphone did not start. Allow microphone access or open this address in Chrome or Edge, then resume.'); }, engine.startupTimeout || 8000);
    } catch { this.fail('This browser cannot start continuous speech. Open the same address in Chrome or Edge.'); }
  }
  private flush() {
    clearTimeout(this.endpoint);
    const text = this.finals.trim(); this.finals = this.latest = '';
    if (!text || !this.state.active) return;
    this.spoken = ''; this.update({ phase: 'thinking', partial: '' }); this.deps.text(text);
  }
  thinking() { this.silence(); clearTimeout(this.endpoint); this.finals = this.latest = ''; this.spoken = ''; this.update({ phase: 'thinking', partial: '', error: '' }); }
  recover() { if (this.state.active) this.update({ phase: 'listening' }); }
  cancelReply() { this.silence(); this.bargeCandidate = 0; this.update({ phase: this.state.active ? 'listening' : 'idle' }); }
  speak(text: string, segments?: AsyncIterable<import('./streamingSpeech').SpeechChunk>) {
    this.silence(); this.spoken = text;
    const token = this.playback; const speech = this.deps.utterance(text); this.speech = speech; speech.lang = this.language;
    if (segments) {
      const self = this;
      speech.segments = (async function* () { for await (const segment of segments) { if (token !== self.playback) return; self.spoken += ' ' + segment.text; yield segment; } })();
    }
    speech.onstart = () => { if (token === this.playback) { this.update({ phase: 'speaking' }); this.deps.playbackStarted?.(); } };
    const done = () => { if (token !== this.playback || this.speech !== speech) return; clearTimeout(this.watchdog); this.speech = null; this.echoUntil = Date.now() + 800; this.update({ phase: this.state.active ? 'listening' : 'idle' }); };
    speech.onend = done;
    speech.onerror = (event: any) => { if (token === this.playback) this.fail(event?.message || 'Voice playback failed. Check your audio output, then resume.'); };
    this.update({ phase: segments ? 'thinking' : 'speaking' });
    try { this.deps.synthesis.speak(speech); this.watchdog = setTimeout(() => { if (token === this.playback) this.fail('Voice playback timed out. Resume to try again.'); }, segments ? 150000 : Math.max(15000, text.length * 150)); }
    catch { this.fail('Voice playback is unavailable in this browser.'); }
  }
}

