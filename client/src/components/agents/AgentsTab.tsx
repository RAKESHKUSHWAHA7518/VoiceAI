import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AgentRoster } from './AgentRoster';
import { DeploymentPanel } from './DeploymentPanel';
import { VoiceLibraryModal } from '../voice/VoiceLibraryModal';
import type { Agent } from '../../types';
interface Props {
  agents: Agent[]; loading?: boolean; error?: string; onRetry?: () => void;
  activeAgent: Agent | null; onSelectAgent: (agent: Agent) => void;
  onSaveAgent: (agent: Partial<Agent>) => Promise<void>; onDeleteAgent: (id: string) => Promise<void>;
  onTestAgent: (agent: Agent) => void; onStartVoiceCall?: (agent: Agent) => void;
  onOpenKnowledge?: (id: string) => void; isCreatingNew?: boolean; setIsCreatingNew?: (value: boolean) => void;
}
const languages = [{ code: 'en', name: 'English' }, { code: 'hi', name: 'Hindi' }, { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' }, { code: 'de', name: 'German' }, { code: 'ja', name: 'Japanese' }, { code: 'pt', name: 'Portuguese' }, { code: 'zh', name: 'Chinese' }];
const defaults: Partial<Agent> = { name: '', role: '', avatar: '🎧', voice_id: 'a0e99841-438c-4a64-b679-ae501e7d6091', llm_model: 'gpt-4o-mini', llm_temperature: .3, system_prompt: 'You are a helpful voice assistant. Speak naturally in short, conversational sentences.', greeting: 'Hello! How can I help you today?', assigned_tools: [], languages_supported: ['en'], default_language: 'en', auto_switch_language: false };
export function AgentsTab({ agents, loading = false, error, onRetry, activeAgent, onSelectAgent, onSaveAgent, onDeleteAgent, onTestAgent, onStartVoiceCall, onOpenKnowledge, isCreatingNew, setIsCreatingNew }: Props) {
  const [editor, setEditor] = useState(false); const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Agent>>({ ...defaults });
  const [step, setStep] = useState<'basics' | 'instructions' | 'voice' | 'tools'>('basics');
  const [tools, setTools] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [toolsError, setToolsError] = useState('');
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsRetry, setToolsRetry] = useState(0);
  const [saving, setSaving] = useState(false); const [saveError, setSaveError] = useState('');
  const [revision, setRevision] = useState(0);
  const [deployAgent, setDeployAgent] = useState<Agent | null>(null);
  const [library, setLibrary] = useState(false); const [voices, setVoices] = useState<Array<{ id: string; name: string }>>([]);
  const dialog = useRef<HTMLDivElement>(null);
  const update = <K extends keyof Agent>(key: K, value: Agent[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const open = (agent?: Agent) => { setEditingId(agent?.id || null); setDraft(structuredClone(agent || defaults)); setStep('basics'); setSaveError(''); setEditor(true); };
  const close = () => { if (saving) return; setEditor(false); setIsCreatingNew?.(false); };
  useEffect(() => { fetch('/api/voices').then(response => response.json()).then(data => { if (Array.isArray(data.voices)) setVoices(data.voices); }).catch(() => {}); }, []);
  useEffect(() => { if (isCreatingNew) open(); }, [isCreatingNew]);
  useEffect(() => {
    if (!editor) return;
    const controller = new AbortController();
    setToolsLoading(true); setToolsError(''); setTools([]);
    const read = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Could not load tools. Saved selections are preserved.');
      return response.json();
    };
    Promise.all([read('/api/tools'), read('/api/workspace-tools')]).then(([builtIn, workspace]) => {
      if (!Array.isArray(builtIn.tools) || !Array.isArray(workspace.records)) throw new Error('Could not load tools. Saved selections are preserved.');
      setTools([
        ...builtIn.tools.map((tool: { name: string; description?: string }) => ({ id: tool.name, name: tool.name.replace(/_/g, ' '), description: tool.description || 'Built-in demo tool' })),
        ...workspace.records.filter((tool: { kind: string }) => tool.kind === 'tool').map((tool: { id: string; name: string; notes?: string }) => ({ id: tool.id, name: tool.name, description: tool.notes || 'Private workspace mock response' }))
      ]);
    }).catch(error => { if (!controller.signal.aborted) setToolsError(error instanceof Error ? error.message : 'Could not load tools.'); })
      .finally(() => { if (!controller.signal.aborted) setToolsLoading(false); });
    return () => controller.abort();
  }, [editor, toolsRetry]);
  const toggleTool = (id: string) => setDraft(previous => ({ ...previous, assigned_tools: (previous.assigned_tools || []).includes(id) ? (previous.assigned_tools || []).filter(value => value !== id) : [...(previous.assigned_tools || []), id] }));
  useEffect(() => {
    if (!editor) return;
    const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLInputElement>('#agent-name')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [editor]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaveError('');
    if (!draft.name?.trim()) { setStep('basics'); setSaveError('Give your agent a name before saving.'); return; }
    if (!draft.system_prompt?.trim()) { setStep('instructions'); setSaveError('Add instructions so your agent knows how to respond.'); return; }
    setSaving(true);
    try { await onSaveAgent({ ...draft, id: editingId || undefined, name: draft.name.trim(), role: draft.role?.trim() || 'Voice assistant' }); setEditor(false); setIsCreatingNew?.(false); }
    catch (err) { setSaveError(err instanceof Error ? err.message : 'Could not save your agent.'); }
    finally { setSaving(false); }
  };
  return <div className="agents-page">
    <AgentRoster agents={agents} activeAgent={activeAgent} voices={voices} loading={loading} error={error} onRetry={onRetry} onCreate={() => open()} onEdit={open} onSelect={onSelectAgent} onTest={onTestAgent} onCall={onStartVoiceCall} onDelete={onDeleteAgent} onVoiceLibrary={() => setLibrary(true)} onDeploy={setDeployAgent} onKnowledge={onOpenKnowledge} revision={revision} />
    {deployAgent && <DeploymentPanel agent={deployAgent} onClose={() => { setDeployAgent(null); setRevision(value => value + 1); }} />}
    {editor && <div className="modal-overlay workflow-overlay"><div className="agent-editor" role="dialog" aria-modal="true" aria-labelledby="agent-editor-title" ref={dialog} onKeyDown={event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') { const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea') || []).filter(element => element.offsetParent !== null); const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    }}>
      <header className="workflow-header"><div><span className="workflow-eyebrow">AGENT BUILDER</span><h2 id="agent-editor-title">{editingId ? 'Edit your agent' : 'Create a voice agent'}</h2><p>{editingId ? 'Update your saved draft. Published versions keep their existing instructions.' : 'Give it a purpose, a voice and a first thing to say.'}</p></div><button className="workflow-close" aria-label="Close agent editor" disabled={saving} onClick={close}>×</button></header>
      <form onSubmit={save} className="agent-editor-form"><div className="agent-editor-body">
        <nav className="agent-editor-steps" aria-label="Agent setup steps">{([{ id: 'basics', title: 'Identity', hint: 'Name and purpose' }, { id: 'instructions', title: 'Conversation', hint: 'Greeting and instructions' }, { id: 'voice', title: 'Voice & language', hint: 'Speech and model' }, { id: 'tools', title: 'Tools', hint: 'Add agent tools' }] as const).map((item, index) => <button key={item.id} type="button" className={step === item.id ? 'is-current' : ''} onClick={() => setStep(item.id)} aria-current={step === item.id ? 'step' : undefined}><span>{index + 1}</span><div><strong>{item.title}</strong><small>{item.hint}</small></div></button>)}<div className="editor-tip"><strong>Ready to test?</strong><p>Save your agent, then choose Talk to agent. Allow the microphone and say hello.</p></div></nav>
        <div className="agent-editor-fields">{saveError && <p className="workflow-error" role="alert">{saveError}</p>}
          {step === 'basics' && <><h3>Who is your agent?</h3><p className="field-intro">A clear name and purpose make it easier to find and test your assistant.</p><label htmlFor="agent-name">Agent name <span>Required</span></label><input id="agent-name" maxLength={120} className="form-input" value={draft.name || ''} onChange={event => update('name', event.target.value)} placeholder="e.g. Maya" /><label htmlFor="agent-role">Purpose</label><input id="agent-role" className="form-input" maxLength={200} value={draft.role || ''} onChange={event => update('role', event.target.value)} placeholder="e.g. Customer support for a travel agency" /><div className="editor-agent-preview"><div>{draft.name?.slice(0, 1) || 'A'}</div><section><strong>{draft.name || 'Your agent'}</strong><p>{draft.role || 'Add a purpose above'}</p></section><span>Draft</span></div></>}
          {step === 'instructions' && <><h3>Shape the conversation</h3><p className="field-intro">Write in plain language. Set the tone, what to help with, and what to avoid.</p><label htmlFor="agent-greeting">First greeting</label><textarea id="agent-greeting" className="form-input" rows={3} maxLength={2000} value={draft.greeting || ''} onChange={event => update('greeting', event.target.value)} /><label htmlFor="agent-prompt">Agent instructions <span>Required</span></label><textarea id="agent-prompt" className="form-input" rows={7} maxLength={30000} value={draft.system_prompt || ''} onChange={event => update('system_prompt', event.target.value)} /><small>Example: You help guests with opening hours and bookings. Be friendly, ask one question at a time, and use the attached knowledge for facts.</small></>}
          {step === 'voice' && <><h3>Choose how it sounds</h3><p className="field-intro">Cloud tests use the saved Cartesia voice when enabled. Browser previews use device speech; other provider voices require their own integration.</p><label htmlFor="agent-language">Spoken language</label><select id="agent-language" className="form-select" value={draft.default_language || 'en'} onChange={event => { update('default_language', event.target.value); update('languages_supported', [...new Set([...(draft.languages_supported || []), event.target.value])]); }}>{languages.map(language => <option key={language.code} value={language.code}>{language.name}</option>)}</select><label htmlFor="agent-voice">Provider voice</label><select id="agent-voice" className="form-select" value={draft.voice_id} onChange={event => update('voice_id', event.target.value)}>{!voices.some(voice => voice.id === draft.voice_id) && <option value={draft.voice_id}>Saved voice</option>}{voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}</select><label htmlFor="agent-model">Language model</label><select id="agent-model" className="form-select" value={draft.llm_model} onChange={event => update('llm_model', event.target.value)}><option value="gemini/gemini-3.8-flash">Google Gemini Flash</option>{draft.llm_model?.startsWith('gemini/') && draft.llm_model !== 'gemini/gemini-3.8-flash' && <option value={draft.llm_model}>Saved Gemini model</option>}<option value="gpt-4o-mini">OpenAI GPT-4o Mini</option><option value="gpt-4o">OpenAI GPT-4o</option><option value="groq/llama-3.1-8b-instant">Groq Llama 3.1 8B</option></select>{draft.llm_model?.startsWith('gemini/') && <><label htmlFor="gemini-model-id">Gemini model ID</label><input className="form-input" id="gemini-model-id" value={draft.llm_model.slice(7)} onChange={event => update('llm_model', 'gemini/' + event.target.value)} maxLength={120} /><small>Use a model available to your Google AI Studio account. Requires GEMINI_API_KEY and live mode on the server.</small></>}<small>Live model use requires a server key. Free demo mode does not call a language model.</small><details className="editor-advanced"><summary>Advanced settings</summary><label htmlFor="agent-temperature">Response creativity: {draft.llm_temperature}</label><input id="agent-temperature" type="range" min="0" max="2" step="0.1" value={draft.llm_temperature} onChange={event => update('llm_temperature', Number(event.target.value))} /><p>Manage tool assignments in the Tools step.</p></details></>}
          {step === 'tools' && <><h3>Add tools to your agent</h3><p className="field-intro">Choose tools to save with this agent. {draft.assigned_tools?.length || 0} selected.</p><p className="tool-mode-notice">Assigned tools run as labeled simulations or mock responses. No external bookings, notifications or transfers are made. In demo mode test with /tool tool_name followed by JSON arguments.</p>{toolsLoading && <p role="status">Loading tools…</p>}{toolsError && <div className="workflow-error" role="alert">{toolsError} <button type="button" className="btn btn-secondary" onClick={() => setToolsRetry(value => value + 1)}>Retry</button></div>}<div className="agent-tool-list">{tools.map(tool => <label key={tool.id} className="agent-tool-option"><input type="checkbox" checked={(draft.assigned_tools || []).includes(tool.id)} onChange={() => toggleTool(tool.id)} disabled={saving} /><div><strong>{tool.name}</strong><small>{tool.description}</small></div></label>)}</div>{!toolsLoading && (draft.assigned_tools || []).filter(id => !tools.some(tool => tool.id === id)).map(id => <label className="agent-tool-option" key={id}><input type="checkbox" checked onChange={() => toggleTool(id)} disabled={saving} /><div><strong>{id}</strong><small>Saved assignment — definition unavailable. Uncheck to remove.</small></div></label>)}<small>To add a custom mock tool: save your agent, open Inspector and use its tool builder. Reopen this step to assign it.</small></>}
        </div></div>
        <footer className="workflow-footer"><p>Save a draft first. Publish it when you are happy with the test.</p><div><button className="btn btn-secondary" type="button" disabled={saving} onClick={close}>Cancel</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create agent'}</button></div></footer>
      </form>
    </div></div>}
    <VoiceLibraryModal isOpen={library} onClose={() => setLibrary(false)} selectedVoiceId={draft.voice_id || ''} onSelectVoice={(id, name) => { update('voice_id', id); update('voice_name', name); }} />
  </div>;
}
