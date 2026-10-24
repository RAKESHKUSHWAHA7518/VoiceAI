/// <reference lib="dom" />
// Exercise the hook's asynchronous resources with lightweight hook/browser adapters.
const mockCleanups: Array<() => void> = [];
jest.mock('../../client/node_modules/react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, jest.fn()],
  useEffect: (callback: () => (() => void) | undefined) => { const cleanup = callback(); if (cleanup) mockCleanups.push(cleanup); },
}));
const { useConversationRecording } = require('../../client/src/hooks/useConversationRecording');

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const originalFetch = global.fetch;
const originals = new Map<string, PropertyDescriptor | undefined>();
let listeners: Map<string, (event: any) => void>;
let stopTrack: jest.Mock; let mic: any; let created: jest.Mock;
class Recorder {
  static isTypeSupported() { return true; }
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable?: (event: any) => void; onstop?: () => void; onerror?: () => void;
  constructor(..._args: unknown[]) { created(); }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['recorded-audio']) }); this.onstop?.(); }); }
  pause() { this.state = 'paused'; } resume() { this.state = 'recording'; }
}
class Context {
  state = 'running'; destination = {};
  async resume() {} async close() { this.state = 'closed'; }
  createMediaStreamDestination() { return { stream: {} }; }
  createMediaStreamSource() { return { connect() {} }; }
}
beforeEach(() => {
  jest.useFakeTimers(); listeners = new Map(); stopTrack = jest.fn(); created = jest.fn();
  mic = { getTracks: () => [{ stop: stopTrack }], getAudioTracks: () => [{ enabled: true }] };
  const values: Record<string, unknown> = { window: { MediaRecorder: Recorder, AudioContext: Context, addEventListener: (name: string, callback: any) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name) }, MediaRecorder: Recorder, AudioContext: Context, navigator: { mediaDevices: { getUserMedia: jest.fn().mockResolvedValue(mic) } } };
  for (const [key, value] of Object.entries(values)) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }); }
});
afterEach(async () => {
  mockCleanups.splice(0).forEach(cleanup => cleanup()); await flush();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  originals.clear(); global.fetch = originalFetch; jest.useRealTimers();
});
const session = { session_id: 'capture-test', greeting: '', runtime_mode: 'demo' as const, speech_output: 'cloud', recording_enabled: true };

test('closing while microphone permission is pending stops late tracks and never starts recording', async () => {
  const permission = deferred<MediaStream>(); (navigator.mediaDevices.getUserMedia as jest.Mock).mockReturnValue(permission.promise);
  global.fetch = jest.fn(); const hook = useConversationRecording(session, jest.fn());
  const starting = hook.start(); await flush(); await hook.finish(); permission.resolve(mic);
  expect(await starting).toBe(false); expect(stopTrack).toHaveBeenCalled(); expect(created).not.toHaveBeenCalled(); expect(global.fetch).not.toHaveBeenCalled();
});

test('closing during authorization aborts the request and rejects a late successful response', async () => {
  const authorization = deferred<any>(); global.fetch = jest.fn().mockReturnValue(authorization.promise);
  const hook = useConversationRecording(session, jest.fn()); const starting = hook.start(); await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1); const signal = (global.fetch as jest.Mock).mock.calls[0][1].signal;
  await hook.finish(); expect(signal.aborted).toBe(true); expect(stopTrack).toHaveBeenCalled();
  authorization.resolve({ ok: true }); expect(await starting).toBe(false); expect(created).not.toHaveBeenCalled();
});

test('tab warning remains during upload and failure, then clears only after a successful retry', async () => {
  const upload = deferred<any>(); global.fetch = jest.fn().mockResolvedValueOnce({ ok: true }).mockReturnValueOnce(upload.promise).mockResolvedValueOnce({ ok: true });
  const hook = useConversationRecording(session, jest.fn()); expect(await hook.start()).toBe(true);
  const warns = () => { const event = { preventDefault: jest.fn(), returnValue: undefined }; listeners.get('beforeunload')!(event); return event.preventDefault.mock.calls.length > 0; };
  expect(warns()).toBe(true);
  const saving = hook.finish(); const failed = expect(saving).rejects.toThrow('Try again');
  await jest.runAllTicks(); await flush(); expect(warns()).toBe(true);
  upload.resolve({ ok: false, json: async () => ({ error: { message: 'Try again' } }) }); await failed;
  expect(warns()).toBe(true); await hook.finish(); expect(warns()).toBe(false);
});
