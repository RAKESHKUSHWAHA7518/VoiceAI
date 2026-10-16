import { useState } from 'react';
import type { Agent } from '../../types';
import { StudioIcon } from '../common/StudioIcon';
import { IconPhone, PersonaAvatar } from '../common/Icons';

interface Props {
  agents: Agent[];
  activeAgent: Agent | null;
  voices: { id: string; name: string }[];
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  onCreate: () => void;
  onEdit: (agent: Agent) => void;
  onSelect: (agent: Agent) => void;
  onTest: (agent: Agent) => void;
  onCall?: (agent: Agent) => void;
  onDelete: (id: string) => Promise<void>;
  onVoiceLibrary: () => void;
}

export function AgentRoster({ agents, activeAgent, voices, loading, error, onRetry, onCreate, onEdit, onSelect, onTest, onCall, onDelete, onVoiceLibrary }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('default');
  const [actionError, setActionError] = useState('');
  const search = query.trim().toLowerCase();
  const visibleAgents = agents.filter(agent => [agent.name, agent.role, agent.llm_model].some(value => value.toLowerCase().includes(search)));
  if (sort === 'name') visibleAgents.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'selected') visibleAgents.sort((a, b) => Number(b.id === activeAgent?.id) - Number(a.id === activeAgent?.id));
  const languages = new Set(agents.flatMap(agent => agent.languages_supported || ['en']));
  const tools = new Set(agents.flatMap(agent => agent.assigned_tools || []));

  return <>
    <div className="studio-page-heading">
      <div><div className="studio-eyebrow"><span /> YOUR VOICE WORKSPACE</div><h2>Great conversations.<br /><span>Start with your agents.</span></h2><p>Build your team, fine-tune their voices, and bring every conversation to life.</p></div>
      <div className="studio-heading-actions"><button className="btn btn-secondary" onClick={onVoiceLibrary}><StudioIcon name="voice" />Voice library</button><button className="btn btn-primary" onClick={onCreate}><StudioIcon name="plus" />Create agent</button></div>
    </div>
    <div className="studio-overview" aria-label="Workspace overview">
      <div className="studio-stat"><span>Voice agents</span><strong>{loading ? '—' : agents.length.toString().padStart(2, '0')}</strong><small>Your conversation team</small></div>
      <div className="studio-stat"><span>Languages</span><strong>{loading ? '—' : languages.size.toString().padStart(2, '0')}</strong><small>Across your agents</small></div>
      <div className="studio-stat"><span>Connected tools</span><strong>{loading ? '—' : tools.size.toString().padStart(2, '0')}</strong><small>Unique capabilities</small></div>
      <div className="studio-try-call"><div className="studio-wave" aria-hidden="true">{[12,24,38,20,45,32,16,29,40,22,12].map((height,index) => <i key={index} style={{height}} />)}</div><div><strong>Hear the difference</strong><span>Try a conversation with your agent.</span></div><button className="studio-icon-button" aria-label="Test selected agent in Playground" disabled={!activeAgent} onClick={() => activeAgent && onTest(activeAgent)}><StudioIcon name="arrow" /></button></div>
    </div>
    <div className="studio-library-header"><div><h3>Your agents <span>{agents.length}</span></h3><p>A voice for every kind of conversation.</p></div><div className="studio-library-controls"><label className="studio-search"><StudioIcon name="search" /><span className="sr-only">Search agents</span><input placeholder="Search agents…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="studio-icon-button" aria-label="Clear search" onClick={() => setQuery('')}><StudioIcon name="close" size={14} /></button>}</label><label className="studio-sort"><StudioIcon name="sliders" /><span className="sr-only">Sort agents</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="default">Default order</option><option value="name">Name A–Z</option><option value="selected">Selected first</option></select></label></div></div>
    {error && <div className="studio-feedback" role="alert"><span>{error}</span><button className="btn btn-secondary" onClick={onRetry}>Try again</button></div>}
    {actionError && <div className="studio-feedback" role="alert">{actionError}</div>}
    {loading ? <div className="studio-agent-grid" aria-label="Loading agents" aria-busy="true">{[0,1,2].map(index => <div key={index} className="studio-skeleton"><span /><span /><span /></div>)}</div> : <div className="studio-agent-grid">
      {visibleAgents.map((agent, index) => {
        const selected = activeAgent?.id === agent.id;
        const voice = voices.find(voice => voice.id === agent.voice_id);
        return <article key={agent.id} className={`studio-agent-card ${selected ? 'is-selected' : ''}`}>
          <div className="studio-agent-top"><div className={`studio-persona persona-${index % 4}`}><PersonaAvatar name={agent.name} role={agent.role} size={46} /></div><span className={selected ? 'studio-selection selected' : 'studio-selection'}>{selected ? <><span />Selected agent</> : 'Voice agent'}</span><button className="studio-icon-button" aria-label={`Edit ${agent.name}`} title="Edit agent" onClick={() => onEdit(agent)}><StudioIcon name="edit" size={16} /></button></div>
          <div className="studio-agent-name"><h3>{agent.name}</h3><p>{agent.role}</p></div>
          <p className="studio-agent-description">{agent.system_prompt}</p>
          <div className="studio-agent-config"><span><StudioIcon name="voice" size={14} />{voice?.name || agent.voice_name || 'Custom voice'}</span><span>{agent.llm_model}</span></div>
          <div className="studio-agent-capabilities"><span><StudioIcon name="globe" size={14} />{(agent.languages_supported || ['en']).length} languages</span><span><StudioIcon name="sliders" size={14} />{(agent.assigned_tools || []).length} tools</span></div>
          <details className="studio-agent-details"><summary>Agent details</summary><p>{agent.system_prompt}</p>{agent.greeting && <p><strong>Greeting</strong> {agent.greeting}</p>}<p><strong>Languages</strong> {(agent.languages_supported || ['en']).join(', ').toUpperCase()}</p><p><strong>Tools</strong> {(agent.assigned_tools || []).join(', ') || 'No tools assigned'}</p><p><strong>Temperature</strong> {agent.llm_temperature}</p>{!agent.is_default && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm(`Delete agent "${agent.name}"?`)) { try { await onDelete(agent.id); } catch { setActionError('Could not delete agent. Please try again.'); } } }}><StudioIcon name="trash" size={14} />Delete agent</button>}</details>
          <div className="studio-agent-actions"><button className="btn btn-secondary" onClick={() => onTest(agent)}>Open playground<StudioIcon name="arrow" size={15} /></button><button className="studio-icon-button call-icon" aria-label={`Call ${agent.name}`} title="Start voice call" onClick={() => onCall ? onCall(agent) : onTest(agent)}><IconPhone size={17} /></button><button className="studio-icon-button" aria-label={selected ? `${agent.name} selected` : `Select ${agent.name}`} aria-pressed={selected} onClick={() => onSelect(agent)} title={selected ? 'Selected agent' : 'Select agent'}><StudioIcon name={selected ? 'check' : 'plus'} size={17} /></button></div>
        </article>;
      })}
    </div>}
    {!loading && !error && !visibleAgents.length && <div className="studio-empty"><StudioIcon name={query ? 'search' : 'voice'} size={32} /><h3>{query ? 'No agents found' : 'Meet your first voice agent'}</h3><p>{query ? 'Try a different name, role, or model.' : 'Give your agent a voice and a purpose to get started.'}</p><button className="btn btn-primary" onClick={query ? () => setQuery('') : onCreate}>{query ? 'Clear search' : 'Create your first agent'}</button></div>}
    <div className="studio-page-note"><StudioIcon name="voice" size={14} />Built for conversations that feel human.<span>Configure. Test. Connect.</span></div>
  </>;
}
