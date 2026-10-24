import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { IconMic } from '../common/Icons';
import type { PlaygroundConfig, PlaygroundTest, Agent } from '../../types';
interface PlaygroundTabProps {
  onStopTest?: () => void; onNewConversation?: () => void; runtimeMode?: string;
  config: PlaygroundConfig; setConfig: React.Dispatch<React.SetStateAction<PlaygroundConfig>>;
  tests: PlaygroundTest[]; sendControl?: (type: string, payload: Record<string, unknown>) => void;
  sendAudioChunk?: (pcm16: Uint8Array) => void; onStopAudio?: () => void;
  onRunTest?: (input: string) => Promise<PlaygroundTest | undefined>;
  onPlayVoice?: (text: string, audioUrl?: string) => void; testActive?: boolean;
  activeAgent?: Agent | null; agents?: Agent[]; onSelectAgent?: (agent: Agent) => void;
  onStartVoiceCall?: (agent: Agent) => void;
}
export function PlaygroundTab({ onStopTest, onNewConversation, runtimeMode, tests, onRunTest, testActive, activeAgent, agents = [], onSelectAgent, onStartVoiceCall }: PlaygroundTabProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!input.trim() || !onRunTest || testActive) return;
    setError('');
    try { const result = await onRunTest(input); if (result?.status === 'completed') setInput(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'The test failed. Please retry.'); }
  };
  const visibleTests = tests.filter(test => test.agent_id === activeAgent?.id);
  return <section className="playground-tab showcase-playground">
    <div className="studio-page-heading"><div><div className="studio-eyebrow"><span /> PLAYGROUND</div><h2>Let’s hear your agent.</h2><p>Try a real question. Check the answer. Make the next conversation better.</p></div><Link className="btn btn-secondary" to="/history">Conversation history</Link></div>
    <details className="preview-mode-details"><summary>About this conversation preview</summary><p>Free demo mode returns a labeled preview from connected sources. To test an assigned tool, send /tool check_booking followed by a JSON object containing booking_id. Custom mock tool names use fixture_ followed by the tool ID without hyphens. Live mode uses a configured language model. Voice tests use the configured speech providers; external actions and phone calls are not enabled here.</p></details>
    <div className="playground-session-bar"><span className="history-mode">{runtimeMode ? runtimeMode === 'demo' ? 'Demo preview · no AI request' : 'Live model' : 'Ready to start'}</span><span>{activeAgent?.llm_model} · saved configuration</span><button type="button" className="btn btn-secondary" onClick={onNewConversation} disabled={!activeAgent}>New conversation</button>{testActive && <button type="button" className="btn btn-secondary" onClick={onStopTest}>Stop response</button>}</div><div className="playground-agent-select"><label htmlFor="test-agent">Agent</label><select id="test-agent" className="form-select" value={activeAgent?.id || ''} onChange={event => { const agent = agents.find(value => value.id === event.target.value); if (agent) onSelectAgent?.(agent); }}><option value="" disabled>Select an agent</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>{activeAgent && <Link to={'/knowledge?agent=' + encodeURIComponent(activeAgent.id)}>Manage connected knowledge →</Link>}</div>
    <div className="voice-launch"><button aria-label="Start a voice conversation" disabled={!activeAgent} onClick={() => activeAgent && onStartVoiceCall?.(activeAgent)}><IconMic size={30} /></button><div><h3>Speak with {activeAgent?.name || 'your agent'}</h3><p>Start once, allow microphone access, and speak naturally. The agent listens between replies.</p><small>Your transcript is saved in Conversation history.</small></div></div>
    {activeAgent && <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '20px 0' }}><span className="history-mode">{(activeAgent.default_language || 'en').toUpperCase()} · Voice test</span><button className="btn btn-secondary" onClick={() => onStartVoiceCall?.(activeAgent)}>Start voice conversation</button><Link to="/agents">Edit agent</Link></div>}
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}><label htmlFor="test-input">Your message</label><textarea id="test-input" className="form-input" maxLength={4000} rows={3} value={input} onChange={event => setInput(event.target.value)} placeholder="Ask a question from your knowledge documents" /><button className="btn btn-primary" disabled={!activeAgent || !input.trim() || testActive}>{testActive ? 'Waiting for the agent...' : 'Send message'}</button></form>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <div role="log" aria-label="Test results" style={{ marginTop: 28 }}>
      {!visibleTests.length && <p>Your test responses will appear here.</p>}
      {visibleTests.map(test => <article key={test.test_id} className="playground-result"><strong>You</strong><p>{test.input}</p><strong>{test.status === 'error' ? 'Response stopped or failed' : activeAgent?.name || 'Agent'}</strong>{test.tool_events?.map((event, index) => <details key={index}><summary>Tool: {event.name} · {event.status}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{event.result}</pre></details>)}<p style={{ whiteSpace: 'pre-wrap' }}>{test.output || (test.status === 'running' ? 'Waiting for the first text…' : '')}</p>{test.status === 'running' && <small role="status">Receiving response…</small>}{test.error && <p role="alert" className="workflow-error">{test.error}</p>}{!!test.sources?.length && <div className="playground-sources"><strong>Knowledge references retrieved</strong>{test.sources.map(source => <Link key={source.doc_id} to={'/knowledge?agent=' + encodeURIComponent(test.agent_id || '')}>{source.title}</Link>)}<small>Retrieved passages are context; they do not guarantee every claim is supported.</small></div>}{test.status === 'completed' && <small>{test.latency_ms} ms server processing · excludes speech recognition and playback</small>}</article>)}
    </div>
  </section>;
}
