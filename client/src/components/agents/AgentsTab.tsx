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
const defaults: Partial<Agent> = { name: '', role: '', avatar: '🎧', voice_id: 'a0e99841-438c-4a64-b679-ae501e7d6091', llm_model: 'gemini/gemini-3.5-flash', llm_temperature: .3, system_prompt: 'You are a helpful voice assistant. Speak naturally in short, conversational sentences.', greeting: 'Hello! How can I help you today?', assigned_tools: [], languages_supported: ['en'], default_language: 'en', auto_switch_language: false };
export function AgentsTab({ agents, loading = false, error, onRetry, activeAgent, onSelectAgent, onSaveAgent, onDeleteAgent, onTestAgent, onStartVoiceCall, onOpenKnowledge, isCreatingNew, setIsCreatingNew }: Props) {
  const [editor, setEditor] = useState(false); const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Agent>>({ ...defaults });
  const [step, setStep] = useState<'basics' | 'instructions' | 'voice' | 'tools'>('basics');
  interface ToolItem {
    id: string;
    name: string;
    label?: string;
    description: string;
    execution_type?: 'live_weather' | 'webhook' | 'mock';
    mock_response?: string;
    webhook_url?: string;
    is_custom?: boolean;
  }
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [toolsError, setToolsError] = useState('');
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsRetry, setToolsRetry] = useState(0);
  const [toolEditorOpen, setToolEditorOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolItem | null>(null);
  const [toolDraft, setToolDraft] = useState({
    name: '',
    label: '',
    description: '',
    execution_type: 'mock' as 'live_weather' | 'webhook' | 'mock',
    mock_response: '{\n  "status": "success",\n  "message": "Custom tool result"\n}',
    webhook_url: '',
  });
  const [toolTestArgs, setToolTestArgs] = useState('{"location": "Delhi"}');
  const [toolTestResult, setToolTestResult] = useState<string | null>(null);
  const [toolTesting, setToolTesting] = useState(false);
  const [toolSaving, setToolSaving] = useState(false);
  const [toolModalError, setToolModalError] = useState('');
  const [quickTestResult, setQuickTestResult] = useState<string | null>(null);
  const [quickTestTool, setQuickTestTool] = useState<string>('');
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
        ...builtIn.tools.map((tool: any) => ({
          id: tool.name,
          name: tool.name,
          label: tool.label || tool.name.replace(/_/g, ' '),
          description: tool.description || 'Built-in tool',
          execution_type: tool.execution_type || (tool.name === 'get_weather' ? 'live_weather' : 'mock'),
          mock_response: tool.mock_response || '',
          webhook_url: tool.webhook_url || '',
          is_custom: !!tool.is_custom,
        })),
        ...workspace.records.filter((tool: { kind: string }) => tool.kind === 'tool').map((tool: { id: string; name: string; notes?: string }) => ({
          id: tool.id,
          name: tool.id,
          label: tool.name,
          description: tool.notes || 'Private workspace mock response',
          execution_type: 'mock' as const,
          is_custom: true,
        }))
      ]);
    }).catch(error => { if (!controller.signal.aborted) setToolsError(error instanceof Error ? error.message : 'Could not load tools.'); })
      .finally(() => { if (!controller.signal.aborted) setToolsLoading(false); });
    return () => controller.abort();
  }, [editor, toolsRetry]);

  const toggleTool = (id: string) => setDraft(previous => ({ ...previous, assigned_tools: (previous.assigned_tools || []).includes(id) ? (previous.assigned_tools || []).filter(value => value !== id) : [...(previous.assigned_tools || []), id] }));

  const openNewToolModal = () => {
    setEditingTool(null);
    setToolDraft({
      name: '',
      label: '',
      description: '',
      execution_type: 'mock',
      mock_response: '{\n  "status": "success",\n  "message": "Custom tool response"\n}',
      webhook_url: '',
    });
    setToolTestArgs('{}');
    setToolTestResult(null);
    setToolModalError('');
    setToolEditorOpen(true);
  };

  const openEditToolModal = (tool: ToolItem) => {
    setEditingTool(tool);
    setToolDraft({
      name: tool.id,
      label: tool.label || tool.name,
      description: tool.description,
      execution_type: tool.execution_type || (tool.id === 'get_weather' ? 'live_weather' : 'mock'),
      mock_response: tool.mock_response || '{\n  "status": "success"\n}',
      webhook_url: tool.webhook_url || '',
    });
    setToolTestArgs(tool.id === 'get_weather' ? '{"location": "Delhi"}' : tool.id === 'check_booking' ? '{"booking_id": "BK-101"}' : '{}');
    setToolTestResult(null);
    setToolModalError('');
    setToolEditorOpen(true);
  };

  const runQuickTest = async (tool: ToolItem) => {
    setQuickTestTool(tool.label || tool.name);
    setQuickTestResult('Fetching real-time output…');
    try {
      const sampleArgs = (tool.execution_type === 'live_weather' || tool.id === 'get_weather')
        ? { location: 'Delhi' }
        : tool.id === 'check_booking'
        ? { booking_id: 'BK-4921' }
        : tool.id === 'check_order'
        ? { order_id: 'ORD-8821' }
        : { query: 'test' };

      const res = await fetch(`/api/tools/${tool.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arguments: sampleArgs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Tool test failed');
      setQuickTestResult(JSON.stringify(data.result, null, 2));
    } catch (err: any) {
      setQuickTestResult('Error: ' + (err.message || 'Execution failed'));
    }
  };

  const runModalTest = async () => {
    setToolTesting(true);
    setToolTestResult(null);
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolTestArgs || '{}');
      } catch {
        throw new Error('Test arguments must be valid JSON');
      }
      const targetName = toolDraft.name.trim() || editingTool?.id || 'get_weather';
      const res = await fetch(`/api/tools/${targetName}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arguments: parsedArgs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Tool test failed');
      setToolTestResult(JSON.stringify(data.result, null, 2));
    } catch (err: any) {
      setToolTestResult('Error: ' + (err.message || 'Execution failed'));
    } finally {
      setToolTesting(false);
    }
  };

  const saveToolConfig = async () => {
    if (!toolDraft.name.trim()) {
      setToolModalError('Tool identifier name is required');
      return;
    }
    if (!toolDraft.description.trim()) {
      setToolModalError('Description is required so the agent knows when to use it');
      return;
    }
    setToolSaving(true);
    setToolModalError('');
    try {
      const cleanName = toolDraft.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const isEdit = !!editingTool;
      const url = isEdit ? `/api/tools/${editingTool.id}` : '/api/tools';
      const method = isEdit ? 'PUT' : 'POST';
      const payload: any = {
        name: cleanName,
        label: toolDraft.label.trim() || cleanName,
        description: toolDraft.description.trim(),
        execution_type: toolDraft.execution_type,
        mock_response: toolDraft.mock_response,
        webhook_url: toolDraft.webhook_url,
      };
      if (cleanName === 'get_weather') {
        payload.parameters = {
          type: 'object',
          properties: { location: { type: 'string', description: 'City name or location' } },
          required: ['location'],
        };
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to save tool');

      setDraft(prev => ({
        ...prev,
        assigned_tools: Array.from(new Set([...(prev.assigned_tools || []), cleanName])),
      }));
      setToolsRetry(c => c + 1);
      setToolEditorOpen(false);
    } catch (err: any) {
      setToolModalError(err.message || 'Failed to save tool');
    } finally {
      setToolSaving(false);
    }
  };
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
          {step === 'voice' && <><h3>Choose how it sounds</h3><p className="field-intro">Cloud tests use the saved Cartesia voice when enabled. Browser previews use device speech; other provider voices require their own integration.</p><label htmlFor="agent-language">Spoken language</label><select id="agent-language" className="form-select" value={draft.default_language || 'en'} onChange={event => { update('default_language', event.target.value); update('languages_supported', [...new Set([...(draft.languages_supported || []), event.target.value])]); }}>{languages.map(language => <option key={language.code} value={language.code}>{language.name}</option>)}</select><label htmlFor="agent-voice">Provider voice</label><select id="agent-voice" className="form-select" value={draft.voice_id} onChange={event => update('voice_id', event.target.value)}>{!voices.some(voice => voice.id === draft.voice_id) && <option value={draft.voice_id}>Saved voice</option>}{voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}</select><label htmlFor="agent-model">Language model</label><select id="agent-model" className="form-select" value={draft.llm_model} onChange={event => update('llm_model', event.target.value)}><option value="gemini/gemini-3.5-flash">Google Gemini 3.5 Flash (Fast & Free)</option><option value="gemini/gemini-3.8-flash">Google Gemini 3.8 Flash</option>{draft.llm_model?.startsWith('gemini/') && !['gemini/gemini-3.5-flash', 'gemini/gemini-3.8-flash'].includes(draft.llm_model) && <option value={draft.llm_model}>Saved Gemini model</option>}<option value="gpt-4o-mini">OpenAI GPT-4o Mini</option><option value="gpt-4o">OpenAI GPT-4o</option><option value="groq/llama-3.1-8b-instant">Groq Llama 3.1 8B</option></select>{draft.llm_model?.startsWith('gemini/') && <><label htmlFor="gemini-model-id">Gemini model ID</label><input className="form-input" id="gemini-model-id" value={draft.llm_model.slice(7)} onChange={event => update('llm_model', 'gemini/' + event.target.value)} maxLength={120} /><small>Use a model available to your Google AI Studio account. Requires GEMINI_API_KEY and live mode on the server.</small></>}<small>Live model use requires a server key. Free demo mode does not call a language model.</small><details className="editor-advanced"><summary>Advanced settings</summary><label htmlFor="agent-temperature">Response creativity: {draft.llm_temperature}</label><input id="agent-temperature" type="range" min="0" max="2" step="0.1" value={draft.llm_temperature} onChange={event => update('llm_temperature', Number(event.target.value))} /><p>Manage tool assignments in the Tools step.</p></details></>}
          {step === 'tools' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Add & Manage Tools</h3>
                  <p className="field-intro" style={{ margin: '4px 0 0 0' }}>
                    Assign tools to your agent. {draft.assigned_tools?.length || 0} selected.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, background: '#f5f3ff', color: '#6d28d9', borderColor: '#c4b5fd' }}
                  onClick={openNewToolModal}
                >
                  ✨ + Create Custom Tool
                </button>
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#166534', lineHeight: 1.5 }}>
                ⚡ <strong>Live Data Fetching:</strong> Tools like <em>get_weather</em> fetch real-time forecasts from the Open-Meteo live API. You can also create external Webhooks or Mock tools and test their live execution below.
              </div>

              {toolsLoading && <p role="status">Loading tools…</p>}
              {toolsError && (
                <div className="workflow-error" role="alert">
                  {toolsError} <button type="button" className="btn btn-secondary" onClick={() => setToolsRetry(value => value + 1)}>Retry</button>
                </div>
              )}

              {quickTestResult && (
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 12, color: '#1e293b' }}>🧪 Live Output ({quickTestTool}):</strong>
                    <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#64748b' }} onClick={() => setQuickTestResult(null)}>✕</button>
                  </div>
                  <pre style={{ margin: 0, fontSize: 11, background: '#0f172a', color: '#38bdf8', padding: 8, borderRadius: 6, overflowX: 'auto', maxHeight: 160 }}>
                    {quickTestResult}
                  </pre>
                </div>
              )}

              <div className="agent-tool-list">
                {tools.map(tool => (
                  <div key={tool.id} className="agent-tool-option" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: 14 }}>
                    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1, cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={(draft.assigned_tools || []).includes(tool.id)}
                        onChange={() => toggleTool(tool.id)}
                        disabled={saving}
                        style={{ marginTop: 4 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 14 }}>{tool.label || tool.name}</strong>
                          <code style={{ fontSize: 11, background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: 4 }}>{tool.id}</code>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '2px 7px',
                              borderRadius: 9999,
                              letterSpacing: '0.04em',
                              background: tool.execution_type === 'live_weather' || tool.id === 'get_weather' ? '#e0f2fe' : tool.execution_type === 'webhook' ? '#dcfce7' : '#f1f5f9',
                              color: tool.execution_type === 'live_weather' || tool.id === 'get_weather' ? '#0284c7' : tool.execution_type === 'webhook' ? '#16a34a' : '#475569',
                            }}
                          >
                            {tool.execution_type === 'live_weather' || tool.id === 'get_weather' ? '⚡ Live Fetch' : tool.execution_type === 'webhook' ? '🌐 Webhook' : '📦 Mock'}
                          </span>
                        </div>
                        <small style={{ display: 'block', marginTop: 4, color: '#64748b' }}>{tool.description}</small>
                      </div>
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6 }}
                        title="Test this tool"
                        onClick={() => runQuickTest(tool)}
                      >
                        🧪 Test
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6 }}
                        title="Edit tool configuration"
                        onClick={() => openEditToolModal(tool)}
                      >
                        ✏️ Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {!toolsLoading && (draft.assigned_tools || []).filter(id => !tools.some(tool => tool.id === id)).map(id => (
                <label className="agent-tool-option" key={id}>
                  <input type="checkbox" checked onChange={() => toggleTool(id)} disabled={saving} />
                  <div>
                    <strong>{id}</strong>
                    <small>Saved assignment — definition unavailable. Uncheck to remove.</small>
                  </div>
                </label>
              ))}
            </>
          )}
        </div></div>
        <footer className="workflow-footer"><p>Save a draft first. Publish it when you are happy with the test.</p><div><button className="btn btn-secondary" type="button" disabled={saving} onClick={close}>Cancel</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create agent'}</button></div></footer>
      </form>
    </div></div>}

    {toolEditorOpen && (
      <div className="modal-overlay workflow-overlay" style={{ zIndex: 1200 }}>
        <div className="agent-editor" role="dialog" aria-modal="true" style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
          <header className="workflow-header">
            <div>
              <span className="workflow-eyebrow">TOOL BUILDER</span>
              <h2>{editingTool ? `Edit Tool: ${editingTool.label || editingTool.name}` : 'Create Custom Tool'}</h2>
              <p>Configure live fetching, webhooks, or mock responses for your voice agent.</p>
            </div>
            <button className="workflow-close" onClick={() => setToolEditorOpen(false)}>×</button>
          </header>
          <div style={{ padding: '18px 24px' }}>
            {toolModalError && <p className="workflow-error" role="alert">{toolModalError}</p>}
            
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              Tool Identifier Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              className="form-input"
              value={toolDraft.name}
              disabled={!!editingTool && !editingTool.is_custom && editingTool.id === 'get_weather'}
              onChange={e => setToolDraft(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
              placeholder="e.g. get_weather, check_crypto, track_order"
              style={{ marginBottom: 12 }}
            />

            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              Display Label
            </label>
            <input
              className="form-input"
              value={toolDraft.label}
              onChange={e => setToolDraft(prev => ({ ...prev, label: e.target.value }))}
              placeholder="e.g. 🌤️ Live Weather, 📦 Order Tracker"
              style={{ marginBottom: 12 }}
            />

            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              Description for Agent (instructions when to invoke) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              className="form-input"
              rows={3}
              value={toolDraft.description}
              onChange={e => setToolDraft(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g. Get current real-time weather and temperature for any city or location."
              style={{ marginBottom: 12 }}
            />

            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              Execution Type
            </label>
            <select
              className="form-select"
              value={toolDraft.execution_type}
              onChange={e => setToolDraft(prev => ({ ...prev, execution_type: e.target.value as any }))}
              style={{ marginBottom: 14 }}
            >
              <option value="live_weather">⚡ Live Weather Fetch (Open-Meteo Real-Time API)</option>
              <option value="webhook">🌐 Live Webhook (HTTP POST to external URL)</option>
              <option value="mock">📦 Custom Mock Response (Configurable JSON)</option>
            </select>

            {toolDraft.execution_type === 'webhook' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  Webhook Endpoint URL <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  className="form-input"
                  value={toolDraft.webhook_url}
                  onChange={e => setToolDraft(prev => ({ ...prev, webhook_url: e.target.value }))}
                  placeholder="https://api.yourdomain.com/tools/lookup"
                />
              </div>
            )}

            {toolDraft.execution_type === 'mock' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  Mock JSON Response
                </label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={toolDraft.mock_response}
                  onChange={e => setToolDraft(prev => ({ ...prev, mock_response: e.target.value }))}
                  placeholder='{"status": "delivered", "date": "today"}'
                />
              </div>
            )}

            {/* Live Test Section */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <strong style={{ fontSize: 13, color: '#1e293b' }}>🧪 Test Live Execution</strong>
              <p style={{ margin: '4px 0 8px 0', fontSize: 12, color: '#64748b' }}>
                Provide test arguments in JSON format and verify tool output:
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  value={toolTestArgs}
                  onChange={e => setToolTestArgs(e.target.value)}
                  placeholder='{"location": "London"}'
                  style={{ fontSize: 12 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={toolTesting || !toolDraft.name}
                  onClick={runModalTest}
                  style={{ flexShrink: 0 }}
                >
                  {toolTesting ? 'Testing…' : 'Run Test'}
                </button>
              </div>
              {toolTestResult && (
                <pre style={{ margin: '10px 0 0 0', fontSize: 11, background: '#0f172a', color: '#38bdf8', padding: 8, borderRadius: 6, overflowX: 'auto', maxHeight: 150 }}>
                  {toolTestResult}
                </pre>
              )}
            </div>
          </div>
          <footer className="workflow-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {editingTool && editingTool.is_custom && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                  onClick={async () => {
                    if (!window.confirm(`Delete custom tool "${editingTool.id}"?`)) return;
                    await fetch(`/api/tools/${editingTool.id}`, { method: 'DELETE' });
                    setToolsRetry(c => c + 1);
                    setToolEditorOpen(false);
                  }}
                >
                  Delete Tool
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setToolEditorOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={toolSaving} onClick={saveToolConfig}>
                {toolSaving ? 'Saving…' : editingTool ? 'Save Changes' : 'Create Tool'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    )}

    <VoiceLibraryModal isOpen={library} onClose={() => setLibrary(false)} selectedVoiceId={draft.voice_id || ''} onSelectVoice={(id, name) => { update('voice_id', id); update('voice_name', name); }} />
  </div>;
}
