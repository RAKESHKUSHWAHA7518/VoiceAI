import { wantsToEndCall, EndCallGate } from '../../shared/endCall';

test.each(["I'm done", 'Okay, I am done. Thank you!', 'Please end the call', 'Cut the call now', 'Goodbye', 'Thank you, goodbye', 'Hang up', "That's all for today", 'I am done with this conversation', 'कॉल बंद कर दो', 'अलविदा'])('accepts explicit ending: %s', text => {
  expect(wantsToEndCall(text)).toBe(true);
});
test.each(["I've done the payment", 'I am done with the payment', "Don't end the call", 'Do not hang up', 'Thanks', 'I am done but I have another question', 'Say goodbye in French', 'The document says goodbye', '"goodbye"', 'Is that all?', 'I have done'])('keeps ambiguous or unrelated conversation open: %s', text => {
  expect(wantsToEndCall(text)).toBe(false);
});
test('waits for both persisted completion and goodbye playback, in either arrival order', () => {
  const finish = jest.fn(); const gate = new EndCallGate(finish);
  gate.request(); expect(finish).not.toHaveBeenCalled();
  gate.playbackFinished(); gate.playbackFinished(); gate.request(); expect(finish).toHaveBeenCalledTimes(1);
  gate.reset(); gate.playbackFinished(); expect(finish).toHaveBeenCalledTimes(1);
  gate.request(); expect(finish).toHaveBeenCalledTimes(2);
});
test('a caller interruption resets the pending end request', () => {
  const finish = jest.fn(); const gate = new EndCallGate(finish);
  gate.request(); gate.reset(); gate.playbackFinished(); expect(finish).not.toHaveBeenCalled();
});
