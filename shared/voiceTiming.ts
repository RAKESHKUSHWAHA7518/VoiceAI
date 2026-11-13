export interface VoiceTiming {
  first_text_ms?: number;
  first_audio_ms?: number;
  transcript_wait_ms?: number;
  speech_to_audio_ms?: number;
  audio_clock: 'scheduled_pcm' | 'media_element';
}
// Both durations use the same browser clock. STT word times are estimates, not acoustic measurements.
export class TurnTiming {
  private start = performance.now();
  private values: VoiceTiming;
  private turn?: string;
  private sent = false;
  constructor(private session: { session_id: string; token?: string }, speechEnd?: number, pcm = false) {
    this.values = { audio_clock: pcm ? 'scheduled_pcm' : 'media_element' };
    if (speechEnd !== undefined && Number.isFinite(speechEnd) && speechEnd <= this.start && this.start - speechEnd < 60000) this.values.transcript_wait_ms = this.start - speechEnd;
  }
  text() { this.values.first_text_ms ??= performance.now() - this.start; }
  audio() {
    this.values.first_audio_ms ??= performance.now() - this.start;
    if (this.values.transcript_wait_ms !== undefined) this.values.speech_to_audio_ms = this.values.transcript_wait_ms + this.values.first_audio_ms;
    this.report();
  }
  complete(turn: string) { this.turn = turn; this.report(); }
  snapshot() { return { ...this.values }; }
  private report() {
    if (this.sent || !this.turn || this.values.first_audio_ms === undefined) return;
    this.sent = true;
    void fetch(`/api/${this.session.token ? 'public/sessions' : 'conversations'}/${this.session.session_id}/timing`, {
      method: 'POST', credentials: this.session.token ? 'omit' : 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(this.session.token ? { Authorization: 'Bearer ' + this.session.token } : {}) },
      body: JSON.stringify({ turn_id: this.turn, ...this.values }),
    }).catch(() => {}); // Telemetry must not interrupt speech or retry provider requests.
  }
}
