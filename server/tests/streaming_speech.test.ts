import { SentenceBuffer, SpeechQueue } from '../../shared/streamingSpeech';
// The browser module is compiled by Jest's browser-aware test transform.
const { CartesiaSynthesis } = require('../../client/src/utils/cloudSpeech');

test('sentence assembly preserves split words and bounds long unpunctuated responses', () => {
  const buffer = new SentenceBuffer();
  expect(buffer.push('Hello wor')).toEqual([]);
  expect(buffer.push('ld. Next')).toEqual(['Hello world.']);
  expect(buffer.push(' sentence', true)).toEqual(['Next sentence']);
  const long = new SentenceBuffer(); const text = 'a'.repeat(520);
  const parts = long.push(text, true); expect(parts.join('')).toBe(text);
  expect(parts.every(value => value.length <= 240)).toBe(true);
});

test('closing drains queued speech; cancellation drops queued speech and wakes a waiting player', async () => {
  const queue = new SpeechQueue(); const iterator = queue[Symbol.asyncIterator]();
  const waiting = iterator.next(); queue.cancel(); expect((await waiting).done).toBe(true);
  queue.push({ text: 'late', turn_id: 'old', segment_index: 0 }); expect((await iterator.next()).done).toBe(true);
  const complete = new SpeechQueue(); complete.push({ text: 'first', turn_id: 'turn', segment_index: 0 }); complete.close();
  const values = []; for await (const value of complete) values.push(value.text); expect(values).toEqual(['first']);
});

test('cloud playback prefetches the next authorized segment and cancels stale audio', async () => {
  const previousFetch = global.fetch; const oldAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  const audios: any[] = []; const started = jest.fn();
  class AudioAdapter {
    onended?: () => void; onerror?: () => void; onplaying?: () => void;
    pause = jest.fn(); constructor(_url: string) { audios.push(this); }
    async play() { this.onplaying?.(); }
  }
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: AudioAdapter });
  global.fetch = jest.fn(async () => ({ ok: true, blob: async () => new Blob(['audio']) } as Response));
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  try {
    const queue = new SpeechQueue(); const synthesis = new CartesiaSynthesis(() => 'session');
    const speech: any = { text: '', segments: queue, onstart: started, onend: jest.fn(), onerror: jest.fn() };
    synthesis.speak(speech); queue.push({ text: 'first', turn_id: 'turn', segment_index: 0 });
    await flush(); expect(audios).toHaveLength(1); expect(started).toHaveBeenCalledTimes(1);
    queue.push({ text: 'second', turn_id: 'turn', segment_index: 1 }); await flush();
    expect(global.fetch).toHaveBeenCalledTimes(2); expect(audios).toHaveLength(1);
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body)).toEqual({ turn_id: 'turn', segment_index: 1 });
    const lateEnd = audios[0].onended; queue.cancel(); synthesis.cancel(); lateEnd(); await flush();
    expect(audios).toHaveLength(1); expect(audios[0].pause).toHaveBeenCalled(); expect(speech.onend).not.toHaveBeenCalled();
  } finally { global.fetch = previousFetch; if (oldAudio) Object.defineProperty(globalThis, 'Audio', oldAudio); else delete (globalThis as any).Audio; }
});
