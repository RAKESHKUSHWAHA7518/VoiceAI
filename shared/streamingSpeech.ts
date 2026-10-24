export interface SpeechChunk { text: string; turn_id: string; segment_index: number }

// Bound latency and memory without emitting unfinished words or splitting surrogate pairs.
export class SentenceBuffer {
  private pending = '';
  push(text: string, finish = false): string[] {
    this.pending += text;
    const result: string[] = [];
    while (this.pending) {
      const sentence = /[.!?।](?:["”']?)(?=\s)|\n/.exec(this.pending);
      let end = sentence ? sentence.index + sentence[0].length : 0;
      if ((!end || end > 240) && this.pending.length > 240) {
        const space = this.pending.lastIndexOf(' ', 240);
        end = space > 80 ? space + 1 : 240;
        const last = this.pending.charCodeAt(end - 1); if (last >= 0xD800 && last <= 0xDBFF) end--;
      }
      if (!end && finish) end = this.pending.length;
      if (!end) break;
      const value = this.pending.slice(0, end).trim(); this.pending = this.pending.slice(end);
      if (value) result.push(value);
    }
    return result;
  }
}

export class SpeechQueue implements AsyncIterable<SpeechChunk> {
  private items: SpeechChunk[] = [];
  private ended = false;
  private wake?: () => void;
  push(item: SpeechChunk) { if (this.ended) return; this.items.push(item); this.wake?.(); }
  close() { this.ended = true; this.wake?.(); }
  cancel() { this.items = []; this.close(); }
  async *[Symbol.asyncIterator]() {
    while (true) {
      const item = this.items.shift();
      if (item) { yield item; continue; }
      if (this.ended) return;
      await new Promise<void>(resolve => { this.wake = resolve; }); this.wake = undefined;
    }
  }
}
