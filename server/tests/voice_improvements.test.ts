import { PCMDecoder, PCMPlayback } from '../../client/src/utils/pcmPlayback';
import { TurnTiming } from '../../shared/voiceTiming';
import { RAGEngine } from '../src/services/rag';
const { fetchLiveWeather } = jest.requireActual('../src/services/tools');
import axios from 'axios';

test('PCM decoder handles split samples and rejects a truncated final sample', () => {
  const decoder = new PCMDecoder();
  expect([...decoder.decode(new Uint8Array([0]))]).toEqual([]);
  expect([...decoder.decode(new Uint8Array([128, 255, 127, 0, 0]))]).toEqual([-1, 32767 / 32768, 0]);
  decoder.finish(); decoder.decode(new Uint8Array([1])); expect(() => decoder.finish()).toThrow('Incomplete');
});

test('PCM starts before the stream completes; cancellation stops queued audio and recording tracks', async () => {
  jest.useFakeTimers();
  const nodes: any[] = []; const stopTrack = jest.fn(); const started = jest.fn();
  const context: any = { state: 'running', currentTime: 0, destination: {}, outputLatency: 0,
    createMediaStreamDestination: () => ({ stream: { getTracks: () => [{ stop: stopTrack }] }, disconnect: jest.fn() }),
    createBuffer: (_channels: number, count: number, rate: number) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) }),
    createBufferSource: () => { const node = { connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn(), onended: null }; nodes.push(node); return node; },
  };
  try {
    const player = new PCMPlayback(context, started);
    await player.push(new Float32Array(2400));
    expect(nodes[0].start).toHaveBeenCalled();
    jest.advanceTimersByTime(30); expect(started).toHaveBeenCalledTimes(1);
    const finished = player.finish(); player.cancel(); await finished;
    expect(nodes[0].stop).toHaveBeenCalled(); expect(stopTrack).toHaveBeenCalled();
    await player.push(new Float32Array(2400)); expect(nodes).toHaveLength(1);
  } finally { jest.useRealTimers(); }
});

test('Hindi queries find legacy documents without re-upload and stay within the agent', () => {
  const rag = new RAGEngine();
  const chunk = (agent: string) => ({ id: agent, doc_id: agent, agent_id: agent, text: 'दिल्ली कार्यालय सोमवार खुलता है', metadata: { title: 'Hours', filename: 'hours' }, term_frequencies: {}, magnitude: 1 });
  (rag as any).chunks = [chunk('ours'), chunk('other')];
  expect(rag.tokenize('दिल्ली कार्यालय')).toEqual(['दिल्ली', 'कार्यालय']);
  const results = rag.search('ours', 'दिल्ली कार्यालय', 2, .15, false);
  expect(results.map(value => value.doc_id)).toEqual(['ours']);
  expect(rag.search('ours', 'unrelated dolphins', 2, .15, false)).toEqual([]);
});

test('voice timing reports once in either completion order and omits speech timing for typed input', async () => {
  const old = global.fetch; global.fetch = jest.fn(async () => ({ ok: true } as Response));
  try {
    const timing = new TurnTiming({ session_id: 'session' }, performance.now() - 400, true);
    timing.text(); timing.audio(); expect(global.fetch).not.toHaveBeenCalled(); timing.complete('turn'); timing.audio();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.speech_to_audio_ms).toBeGreaterThanOrEqual(400); expect(body.audio_clock).toBe('scheduled_pcm');
    const typed = new TurnTiming({ session_id: 'session', token: 'guest' }); typed.complete('next'); typed.audio();
    expect(typed.snapshot().speech_to_audio_ms).toBeUndefined();
    expect((global.fetch as jest.Mock).mock.calls[1][1].credentials).toBe('omit');
  } finally { global.fetch = old; }
});

test('live weather never invents a fallback forecast; cancellation reaches the HTTP request', async () => {
  const request = jest.spyOn(axios, 'get');
  try {
    request.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchLiveWeather('Delhi')).rejects.toThrow('WEATHER_UNAVAILABLE');
    const abort = new AbortController(); abort.abort();
    await expect(fetchLiveWeather('Delhi', abort.signal)).rejects.toThrow('TURN_CANCELLED');
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce({ data: { results: [{ name: 'Delhi', latitude: 1, longitude: 2 }] } }).mockResolvedValueOnce({ data: { current: { temperature_2m: 30, weather_code: 0, time: '2026-10-26T12:00' } } });
    await expect(fetchLiveWeather('Delhi')).resolves.toMatchObject({ mode: 'live', temperature_c: 30, observed_at: '2026-10-26T12:00' });
    expect(request.mock.calls[1][1]?.signal).toBeDefined();
  } finally { request.mockRestore(); }
});
