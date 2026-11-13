import { ContinuousVoice } from '../../shared/continuousVoice';

function fixture(engineOptions: Record<string, unknown> = {}) {
  const engines: any[] = []; const speeches: any[] = [];
  const text = jest.fn(); const interrupt = jest.fn(); const cancel = jest.fn();
  const controller = new ContinuousVoice({
    recognition: () => { const engine = { ...engineOptions, start: jest.fn(), abort: jest.fn() }; engines.push(engine); return engine; },
    utterance: value => { const speech = { text: value }; speeches.push(speech); return speech; },
    synthesis: { cancel, speak: jest.fn() }, changed: jest.fn(), text, interrupt,
  }, 'en-US');
  const result = (words: string, final = true) => { const value: any = [{ transcript: words }]; value.isFinal = final; engines.at(-1).onresult({ resultIndex: 0, results: [value] }); };
  return { controller, engines, speeches, text, interrupt, cancel, result };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('starts once, greets after recognition connects and keeps listening across replies', () => {
  const f = fixture(); f.controller.start('Hello visitor');
  expect(f.engines[0].continuous).toBe(true);
  expect(f.speeches).toHaveLength(0);
  f.engines[0].onstart(); f.speeches[0].onend();
  expect(f.controller.state.phase).toBe('listening');
  f.result('Book a room'); jest.advanceTimersByTime(750);
  expect(f.text).toHaveBeenCalledWith('Book a room');
  f.controller.speak('Which day?'); f.speeches[1].onend();
  f.result('Tomorrow'); jest.advanceTimersByTime(750);
  expect(f.text).toHaveBeenLastCalledWith('Tomorrow');
  expect(f.engines).toHaveLength(1);
});
test('joins final segments and waits for interim words to finalize', () => {
  const f = fixture(); f.controller.start(); f.engines[0].onstart();
  f.result('I would like'); f.result('a room', false); jest.advanceTimersByTime(1000);
  expect(f.text).not.toHaveBeenCalled();
  f.result('a room'); jest.advanceTimersByTime(750);
  expect(f.text).toHaveBeenCalledWith('I would like a room');
});
test('new speech interrupts playback without letting stale playback callbacks restart it', () => {
  const f = fixture(); f.controller.start(); f.engines[0].onstart(); f.controller.speak('Which day works best?');
  const oldEnd = f.speeches[0].onend; const oldError = f.speeches[0].onerror;
  f.result('Actually cancel that', false);
  expect(f.controller.state.phase).toBe('speaking');
  jest.advanceTimersByTime(260); f.result('Actually cancel that', false);
  expect(f.controller.state.phase).toBe('listening');
  expect(f.interrupt).toHaveBeenCalledTimes(2); // Initial start cleanup and this interruption.
  f.result('Actually cancel that'); jest.advanceTimersByTime(750);
  oldEnd(); oldError();
  expect(f.controller.state.phase).toBe('thinking');
  expect(f.text).toHaveBeenCalledWith('Actually cancel that');
});

test('cloud endpoint flushes finalized speech immediately and never submits interim words', () => {
  const f = fixture(); f.controller.start(); f.engines[0].onstart();
  f.result('Please book'); f.result('a room', false); f.engines[0].onutteranceend();
  expect(f.text).not.toHaveBeenCalled();
  f.result('a room'); f.engines[0].onutteranceend();
  expect(f.text).toHaveBeenCalledWith('Please book a room');
  jest.advanceTimersByTime(1000); expect(f.text).toHaveBeenCalledTimes(1);
});

test('isolated interim noise and filler words do not interrupt playback', () => {
  const f = fixture(); f.controller.start(); f.engines[0].onstart(); f.controller.speak('Your reservation is confirmed');
  const calls = f.interrupt.mock.calls.length;
  f.result('noise', false); jest.advanceTimersByTime(500); f.result('um');
  expect(f.interrupt).toHaveBeenCalledTimes(calls); expect(f.controller.state.phase).toBe('speaking');
  f.result('stop'); expect(f.controller.state.phase).toBe('listening');
});

test('manual interruption stops typed reply playback even when the microphone is inactive', () => {
  const f = fixture(); f.controller.speak('A typed answer');
  f.controller.cancelReply(); expect(f.controller.state.phase).toBe('idle');
  const cancels = f.cancel.mock.calls.length; f.speeches[0].onend();
  expect(f.controller.state.phase).toBe('idle'); expect(f.cancel).toHaveBeenCalledTimes(cancels);
});

test('overlapping words in a correction and short finalized answers are not discarded as echo', () => {
  const f = fixture(); f.controller.start(); f.engines[0].onstart();
  f.controller.speak('Your booking is for Monday morning');
  f.result('No my booking is for Tuesday'); jest.advanceTimersByTime(750);
  expect(f.text).toHaveBeenLastCalledWith('No my booking is for Tuesday');
  f.controller.speak('Please say yes or no'); f.result('No.'); jest.advanceTimersByTime(750);
  expect(f.text).toHaveBeenLastCalledWith('No.');
});
test('suppresses recognizable playback echo and reconnects after normal silence', () => {
  const f = fixture(); f.controller.start(); f.engines[0].onstart(); f.controller.speak('Welcome to our hotel');
  f.result('Welcome to our hotel'); jest.advanceTimersByTime(750);
  expect(f.text).not.toHaveBeenCalled();
  f.engines[0].onerror({ error: 'no-speech' }); f.engines[0].onend(); jest.advanceTimersByTime(250);
  expect(f.engines).toHaveLength(2);
});
test('pause aborts recognition, clears pending input and prevents late results', () => {
  const f = fixture(); f.controller.start(); f.engines[0].onstart(); f.result('Do not send');
  const late = f.engines[0].onend; f.controller.pause(); late(); jest.advanceTimersByTime(2000);
  expect(f.text).not.toHaveBeenCalled(); expect(f.controller.state.active).toBe(false);
  expect(f.engines[0].abort).toHaveBeenCalled(); expect(f.engines).toHaveLength(1);
});
test('permission denial and startup timeout pause instead of retrying forever', () => {
  const f = fixture(); f.controller.start(); f.engines[0].onerror({ error: 'not-allowed' });
  expect(f.controller.state).toMatchObject({ active: false, phase: 'error' });
  f.controller.start(); jest.advanceTimersByTime(8000);
  expect(f.controller.state.error).toContain('did not start');
  expect(f.controller.state.active).toBe(false);
});


test('cloud startup progress distinguishes permission wait and uses its longer timeout', () => {
 const f = fixture({ startupTimeout: 30000, startupMessage: () => 'Waiting for microphone permission' }); f.controller.start(); const engine = f.engines[0];
 engine.onprogress('Waiting for Chrome microphone permission');
 expect(f.controller.state.detail).toBe('Waiting for Chrome microphone permission');
 jest.advanceTimersByTime(8000); expect(f.controller.state.active).toBe(true);
 jest.advanceTimersByTime(22000); expect(f.controller.state.error).toBe('Waiting for microphone permission');
 f.controller.pause(); engine.onprogress?.('stale progress'); expect(f.controller.state.active).toBe(false);
});
