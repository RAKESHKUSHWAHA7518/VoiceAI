// Finishing a task is not a request to end the conversation.
export function wantsToEndCall(input: string): boolean {
  let text = input.toLowerCase().replace(/[’]/g, "'").replace(/[.!?,।]+/g, ' ').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:(?:okay|ok|thanks|thank you|all right)\s+)+/, '').replace(/\s+(?:thanks|thank you)$/, '');
  return /^(?:(?:please\s+)?(?:end|disconnect|stop|cut)\s+(?:(?:the|this|our)\s+)?(?:call|conversation|chat)(?:\s+(?:please|now))?|(?:please\s+)?hang up(?:\s+now)?|goodbye|bye(?: bye)?|i(?:'m| am) done(?: (?:here|talking|for now|now|with (?:this|the) (?:call|conversation|chat)))?|that(?:'s| is) all(?: for (?:now|today))?|अलविदा|बस इतना ही|कॉल बंद कर दो|बातचीत समाप्त करो)$/.test(text);
}

export const endCallTool = {
  name: 'end_call',
  description: 'End only when the caller explicitly requests to finish or says goodbye. Never use for task completion, thanks alone, negation, or quoted text. The platform validates intent and waits for goodbye playback and recording save.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: () => ({ end_call: true, reason: 'caller_requested' }),
};

// Either playback or the persisted completion event can arrive first.
export class EndCallGate {
  private requested = false;
  private played = false;
  private fired = false;
  constructor(private finish: () => void) {}
  reset() { this.requested = this.played = this.fired = false; }
  request() { this.requested = true; this.check(); }
  playbackFinished() { this.played = true; this.check(); }
  private check() { if (this.requested && this.played && !this.fired) { this.fired = true; this.finish(); } }
}
