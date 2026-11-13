// Signed little-endian PCM, decoded incrementally even when HTTP chunks split a sample.
export class PCMDecoder {
  private tail?: number;
  decode(bytes: Uint8Array): Float32Array {
    const data = this.tail === undefined ? bytes : new Uint8Array([this.tail, ...bytes]);
    const count = Math.floor(data.length / 2);
    this.tail = data.length % 2 ? data[data.length - 1] : undefined;
    const view = new DataView(data.buffer, data.byteOffset, count * 2);
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    return samples;
  }
  finish() { if (this.tail !== undefined) throw new Error('Incomplete voice audio. Please retry.'); }
}

export class PCMPlayback {
  private nodes = new Set<AudioBufferSourceNode>();
  private next = 0;
  private stopped = false;
  private wake?: () => void;
  private firstTimer?: ReturnType<typeof setTimeout>;
  private started = false;
  readonly stream: MediaStream;
  private output: MediaStreamAudioDestinationNode;
  constructor(private context: AudioContext, private onStarted: () => void) {
    this.output = context.createMediaStreamDestination(); this.stream = this.output.stream;
  }
  async push(samples: Float32Array) {
    // Limit scheduled audio to two seconds; fetch's reader supplies backpressure.
    while (!this.stopped && this.next - this.context.currentTime > 2) await new Promise<void>(resolve => setTimeout(resolve, 25));
    if (this.stopped || !samples.length) return;
    if (this.context.state !== 'running') throw new Error('Browser audio is paused. Resume the conversation.');
    const buffer = this.context.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);
    const node = this.context.createBufferSource(); node.buffer = buffer;
    node.connect(this.context.destination); node.connect(this.output);
    const when = Math.max(this.context.currentTime + 0.025, this.next);
    this.next = when + buffer.duration; this.nodes.add(node);
    node.onended = () => { node.disconnect(); this.nodes.delete(node); this.wake?.(); };
    node.start(when);
    if (!this.started) {
      this.started = true;
      this.firstTimer = setTimeout(() => { if (!this.stopped) this.onStarted(); }, Math.max(0, (when - this.context.currentTime + (this.context.outputLatency || 0)) * 1000));
    }
  }
  async finish() {
    if (!this.started && !this.stopped) throw new Error('The voice provider returned no audio.');
    while (!this.stopped && this.nodes.size) await new Promise<void>(resolve => { this.wake = resolve; });
    this.wake = undefined;
  }
  cancel() {
    this.stopped = true; clearTimeout(this.firstTimer);
    for (const node of this.nodes) { node.onended = null; node.stop(); node.disconnect(); }
    this.nodes.clear(); this.wake?.(); this.output.disconnect(); this.stream.getTracks().forEach(track => track.stop());
  }
}
