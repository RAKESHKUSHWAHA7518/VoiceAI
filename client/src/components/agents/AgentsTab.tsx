import { AgentRoster } from './AgentRoster';
import React, { useState, useEffect, useRef } from 'react';
import { StudioIcon } from '../common/StudioIcon';
import type { Agent, ToolItem } from '../../types';
import { VoiceLibraryModal } from '../voice/VoiceLibraryModal';
const PRESET_AVATARS = ['🤖', '👩‍💼', '👨‍⚕️', '🛎️', '🎙️', '⚡', '💼', '🎧'];

interface AgentsTabProps {
  agents: Agent[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  activeAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  onSaveAgent: (agent: Partial<Agent>) => Promise<void>;
  onDeleteAgent: (agentId: string) => Promise<void>;
  onTestAgent: (agent: Agent) => void;
  onStartVoiceCall?: (agent: Agent) => void;
  onOpenKnowledge?: (agentId: string) => void;
  isCreatingNew?: boolean;
  setIsCreatingNew?: (val: boolean) => void;
}

const DEFAULT_TOOLS = [
  { name: 'get_weather', label: 'Live Weather', description: 'Real-time forecasts and weather conditions' },
  { name: 'check_booking', label: 'Booking Lookup', description: 'Verify reservations, dates, and party sizes' },
  { name: 'transfer_call', label: 'Call Transfer', description: 'Route caller to specific departments' },
];

const PRESET_VOICES = [
  { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Friendly Assistant (Sonic 3.6)' },
  { id: '694f12bc-9263-4416-8a0e-42427a718214', name: 'Calm Narrative (Sonic 3.6)' },
  { id: '5c5ad5e7-1020-476b-8b91-e4c194e4f7a7', name: 'Upbeat Conversational' },
];

export const AVAILABLE_LANGUAGES = [
  { code: 'en', flag: '🇺🇸', name: 'English (US)' },
  { code: 'es', flag: '🇪🇸', name: 'Spanish (Español)' },
  { code: 'fr', flag: '🇫🇷', name: 'French (Français)' },
  { code: 'de', flag: '🇩🇪', name: 'German (Deutsch)' },
  { code: 'ja', flag: '🇯🇵', name: 'Japanese (日本語)' },
  { code: 'hi', flag: '🇮🇳', name: 'Hindi (हिन्दी)' },
  { code: 'pt', flag: '🇧🇷', name: 'Portuguese (Português)' },
  { code: 'zh', flag: '🇨🇳', name: 'Chinese (中文)' },
];

export function AgentsTab({
  agents,
  loading = false,
  error,
  onRetry,
  activeAgent,
  onSelectAgent,
  onSaveAgent,
  onDeleteAgent,
  onTestAgent,
  onStartVoiceCall,
  isCreatingNew,
  setIsCreatingNew,
}: AgentsTabProps) {
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showModal, setShowModal] = useState(isCreatingNew || false);
  const [showVoiceLibrary, setShowVoiceLibrary] = useState<boolean>(false);
  const [voicesList, setVoicesList] = useState<any[]>(PRESET_VOICES);
  const [toolsList, setToolsList] = useState<ToolItem[]>(DEFAULT_TOOLS as any);

  // Load voices & tools
  useEffect(() => {
    fetch('/api/voices')
      .then(r => r.json())
      .then(data => {
        if (data.voices && Array.isArray(data.voices)) {
          setVoicesList(data.voices);
        }
      })
      .catch(() => {});
  }, [showVoiceLibrary]);

  // Load active tools (built-in + custom)
  useEffect(() => {
    fetch('/api/tools')
      .then(r => r.json())
      .then(data => {
        if (data.tools && Array.isArray(data.tools)) {
          setToolsList(data.tools);
        }
      })
      .catch(console.error);
  }, [showModal]);

  // Form state
  const [formId, setFormId] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formRole, setFormRole] = useState<string>('');
  const [formAvatar, setFormAvatar] = useState<string>('🤖');
  const [formVoiceId, setFormVoiceId] = useState<string>(PRESET_VOICES[0].id);
  const [formModel, setFormModel] = useState<string>('gpt-4o-mini');
  const [formTemp, setFormTemp] = useState<number>(0.3);
  const [formPrompt, setFormPrompt] = useState<string>('');
  const [formGreeting, setFormGreeting] = useState<string>('');
  const [formTools, setFormTools] = useState<string[]>(['get_weather', 'check_booking']);
  const [formLanguages, setFormLanguages] = useState<string[]>(['en', 'es', 'fr', 'de']);
  const [formDefaultLang, setFormDefaultLang] = useState<string>('en');
  const [formAutoSwitch, setFormAutoSwitch] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  const openCreateModal = () => {
    setSaveError('');
    setEditingAgent(null);
    setFormId('');
    setFormName('');
    setFormRole('');
    setFormAvatar('🤖');
    setFormVoiceId(PRESET_VOICES[0].id);
    setFormModel('gpt-4o-mini');
    setFormTemp(0.3);
    setFormPrompt('You are a helpful voice assistant. Speak naturally in short, conversational sentences.');
    setFormGreeting('Hello! How can I assist you today?');
    setFormTools(['get_weather', 'check_booking']);
    setFormLanguages(['en', 'es', 'fr', 'de']);
    setFormDefaultLang('en');
    setFormAutoSwitch(true);
    setShowModal(true);
    setIsCreatingNew?.(true);
  };

  const openEditModal = (agent: Agent) => {
    setSaveError('');
    setEditingAgent(agent);
    setFormId(agent.id);
    setFormName(agent.name);
    setFormRole(agent.role);
    setFormAvatar(agent.avatar || '🤖');
    setFormVoiceId(agent.voice_id);
    setFormModel(agent.llm_model);
    setFormTemp(agent.llm_temperature);
    setFormPrompt(agent.system_prompt);
    setFormGreeting(agent.greeting || `Hello! I am ${agent.name}. How can I assist you today?`);
    setFormTools(agent.assigned_tools || []);
    setFormLanguages(agent.languages_supported || ['en', 'es']);
    setFormDefaultLang(agent.default_language || 'en');
    setFormAutoSwitch(agent.auto_switch_language ?? true);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setIsCreatingNew?.(false);
    setEditingAgent(null);
  };

  const handleToggleTool = (toolId: string) => {
    setFormTools(prev =>
      prev.includes(toolId) ? prev.filter(t => t !== toolId) : [...prev, toolId]
    );
  };

  const handleToggleLanguage = (langCode: string) => {
    setFormLanguages(prev =>
      prev.includes(langCode)
        ? (prev.length > 1 ? prev.filter(l => l !== langCode) : prev)
        : [...prev, langCode]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setSaving(true);
    try {
      await onSaveAgent({
        id: formId || undefined,
        name: formName,
        role: formRole || 'Specialized Agent',
        avatar: formAvatar,
        voice_id: formVoiceId,
        llm_model: formModel,
        llm_temperature: formTemp,
        system_prompt: formPrompt,
        greeting: formGreeting,
        assigned_tools: formTools,
        languages_supported: formLanguages,
        default_language: formDefaultLang,
        auto_switch_language: formAutoSwitch,
      });
      closeModal();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your agent. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (isCreatingNew) openCreateModal();
  }, [isCreatingNew]);

  useEffect(() => {
    if (!showModal || showVoiceLibrary) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) closeModal();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea') || []).filter(element => element.offsetParent !== null);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [showModal, showVoiceLibrary, saving]);

  return (
    <div className="agents-page">
      <AgentRoster agents={agents} activeAgent={activeAgent} voices={voicesList} loading={loading} error={error} onRetry={onRetry} onCreate={openCreateModal} onEdit={openEditModal} onSelect={onSelectAgent} onTest={onTestAgent} onCall={onStartVoiceCall} onDelete={onDeleteAgent} onVoiceLibrary={() => setShowVoiceLibrary(true)} />

      {/* Agent Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { if (!saving) closeModal(); }}>
          <div ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="agent-dialog-title" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="agent-dialog-title">{editingAgent ? `Edit agent: ${editingAgent.name}` : 'Create a voice agent'}</h3>
              <button className="modal-close-btn" aria-label="Close agent editor" disabled={saving} onClick={closeModal}><StudioIcon name="close" /></button>
            </div>

            <form onSubmit={handleSubmit} className="agent-form">
              {saveError && <div className="studio-feedback" role="alert">{saveError}</div>}
              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="agent-name" className="form-label">Agent Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Maya, Jordan, Travel Scout"
                    id="agent-name" value={formName}
                    onChange={e => setFormName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="agent-role" className="form-label">Role / Tagline</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Customer Support Lead"
                    id="agent-role" value={formRole}
                    onChange={e => setFormRole(e.target.value)}
                  />
                </div>
              </div>

              {/* Avatar Picker */}
              <div className="form-group">
                <label className="form-label">Agent Icon</label>
                <div className="avatar-picker">
                  {PRESET_AVATARS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className={`avatar-choice ${formAvatar === emoji ? 'selected' : ''}`}
                      onClick={() => setFormAvatar(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <label htmlFor="agent-voice" className="form-label" style={{ margin: 0 }}>Voice Model</label>
                    <button
                      type="button"
                      onClick={() => setShowVoiceLibrary(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--studio-accent)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      🎙️ Voice Library & Clones →
                    </button>
                  </div>
                  <select
                    className="form-select"
                    id="agent-voice" value={formVoiceId}
                    onChange={e => setFormVoiceId(e.target.value)}
                  >
                    {voicesList.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name}{v.provider ? ` (${v.provider === 'custom_clone' ? 'Custom Clone' : v.provider})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="agent-model" className="form-label">LLM Model</label>
                  <select
                    className="form-select"
                    id="agent-model" value={formModel}
                    onChange={e => setFormModel(e.target.value)}
                  >
                    <option value="gpt-4o-mini">GPT-4o Mini (Fast & Low Latency)</option>
                    <option value="gpt-4o">GPT-4o (Maximum Intelligence)</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
                </div>

                <div className="form-group" style={{ width: '130px' }}>
                  <label htmlFor="agent-temperature" className="form-label">Temperature: {formTemp}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    className="form-input"
                    id="agent-temperature" value={formTemp}
                    onChange={e => setFormTemp(parseFloat(e.target.value))}
                  />
                </div>
              </div>

              {/* Initial Greeting (Agent Speaks First) */}
              <div className="form-group">
                <label htmlFor="agent-greeting" className="form-label">🗣️ Initial Greeting (Agent Speaks First)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Hello! How can I assist you today?"
                  id="agent-greeting" value={formGreeting}
                  onChange={e => setFormGreeting(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--studio-secondary)', marginTop: '0.25rem', display: 'block' }}>
                  The agent speaks this greeting aloud first when a call begins before listening to the user.
                </span>
              </div>

              {/* System Prompt */}
              <div className="form-group">
                <label htmlFor="agent-prompt" className="form-label">System Prompt (Persona, Tone & Instructions)</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="You are a helpful voice assistant. Speak naturally in concise sentences..."
                  id="agent-prompt" value={formPrompt}
                  onChange={e => setFormPrompt(e.target.value)}
                />
              </div>

              {/* Multilingual & Auto-Switching Config */}
              <div className="form-group" style={{ background: 'rgba(var(--studio-accent-rgb), 0.05)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(var(--studio-accent-rgb), 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    🌐 Multi-Language Auto-Detection & Bilingual Voice
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--studio-accent)' }}>
                    <input
                      type="checkbox"
                      checked={formAutoSwitch}
                      onChange={e => setFormAutoSwitch(e.target.checked)}
                    />
                    Enable Mid-Call Auto-Switch
                  </label>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--studio-secondary)', display: 'block', marginBottom: '0.75rem' }}>
                  When enabled, the pipeline detects if a caller switches language mid-stream and seamlessly adapts system prompt persona and native TTS voice model.
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {AVAILABLE_LANGUAGES.map(lang => {
                    const isChecked = formLanguages.includes(lang.code);
                    return (
                      <label
                        key={lang.code}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          background: isChecked ? 'rgba(var(--studio-accent-rgb), 0.25)' : 'rgba(255, 255, 255, 0.04)',
                          border: isChecked ? '1px solid var(--studio-accent)' : '1px solid rgba(255, 255, 255, 0.1)',
                          color: isChecked ? 'var(--studio-accent)' : 'var(--studio-secondary)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleLanguage(lang.code)}
                        />
                        <span>{lang.flag} {lang.name.split(' ')[0]}</span>
                      </label>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--studio-secondary)' }}>Default Spoken Language:</span>
                  <select
                    className="form-select"
                    style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                    value={formDefaultLang}
                    onChange={e => setFormDefaultLang(e.target.value)}
                  >
                    {AVAILABLE_LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.flag} {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tool Assignments */}
              <div className="form-group">
                <label className="form-label">Assigned Function Tools (Built-in & Custom)</label>
                <div className="tools-selection-grid">
                  {toolsList.map(t => {
                    const toolId = t.name;
                    const checked = formTools.includes(toolId);
                    return (
                      <label key={toolId} className={`tool-select-card ${checked ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleTool(toolId)}
                        />
                        <div className="tool-select-meta">
                          <span className="tool-select-title">
                            {t.label || toolId}
                            {t.is_custom && (
                              <span style={{ marginLeft: '0.4rem', background: 'var(--studio-accent)', color: 'var(--studio-inset)', fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                Custom
                              </span>
                            )}
                          </span>
                          <span className="tool-select-desc">{t.description}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingAgent ? 'Update Agent' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Voice Library & Voice Cloning Modal */}
      <VoiceLibraryModal
        isOpen={showVoiceLibrary}
        onClose={() => setShowVoiceLibrary(false)}
        selectedVoiceId={formVoiceId}
        onSelectVoice={(voiceId) => {
          setFormVoiceId(voiceId);
          fetch('/api/voices')
            .then(r => r.json())
            .then(data => {
              if (data.voices) setVoicesList(data.voices);
            });
        }}
      />
    </div>
  );
}
