import React, { useState, useEffect } from 'react';
import type { Agent, ToolItem } from '../../types';
const PRESET_AVATARS = ['🤖', '👩‍💼', '👨‍⚕️', '🛎️', '🎙️', '⚡', '💼', '🎧'];

interface AgentsTabProps {
  agents: Agent[];
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

export function AgentsTab({
  agents,
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
  const [toolsList, setToolsList] = useState<ToolItem[]>(DEFAULT_TOOLS as any);

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
  const [saving, setSaving] = useState<boolean>(false);

  const openCreateModal = () => {
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
    setShowModal(true);
    setIsCreatingNew?.(true);
  };

  const openEditModal = (agent: Agent) => {
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
      });
      closeModal();
    } catch (err) {
      console.error('Failed to save agent:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="agents-page">
      {/* Top Action Header */}
      <div className="agents-header">
        <div>
          <h2>Voice Agents Roster</h2>
          <p className="agents-subtitle">
            Configure, customize, and deploy multi-persona voice agents with dedicated voices and tools.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          + Create New Agent
        </button>
      </div>

      {/* Agents Grid */}
      <div className="agents-grid">
        {agents.map((agent) => {
          const isActive = activeAgent?.id === agent.id;
          return (
            <div key={agent.id} className={`agent-card ${isActive ? 'agent-card-active' : ''}`}>
              <div className="agent-card-top">
                <span className="agent-card-avatar">{agent.avatar || '🤖'}</span>
                <div className="agent-card-meta">
                  <div className="agent-card-title-row">
                    <h3 className="agent-card-name">{agent.name}</h3>
                    {isActive && <span className="active-tag">Active</span>}
                  </div>
                  <div className="agent-card-role">{agent.role}</div>
                </div>
              </div>

              <div className="agent-card-prompt">
                "{agent.system_prompt}"
              </div>

              {agent.greeting && (
                <div className="agent-card-greeting">
                  <span className="spec-label">🗣️ Speaks First:</span>
                  <div className="greeting-text">"{agent.greeting}"</div>
                </div>
              )}

              <div className="agent-card-specs">
                <div className="spec-item">
                  <span className="spec-label">Model:</span>
                  <span className="spec-val">{agent.llm_model}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Temp:</span>
                  <span className="spec-val">{agent.llm_temperature}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Voice:</span>
                  <span className="spec-val" title={agent.voice_id}>Sonic 3.6</span>
                </div>
              </div>

              <div className="agent-card-tools">
                <span className="spec-label">Enabled Tools:</span>
                <div className="tools-tag-list">
                  {(agent.assigned_tools && agent.assigned_tools.length > 0) ? (
                    agent.assigned_tools.map(tool => (
                      <span key={tool} className="tool-pill">{tool}</span>
                    ))
                  ) : (
                    <span className="no-tools-text">No tools assigned</span>
                  )}
                </div>
              </div>

              <div className="agent-card-actions">
                <button 
                  className="btn btn-primary btn-sm" 
                  onClick={() => onStartVoiceCall ? onStartVoiceCall(agent) : onTestAgent(agent)}
                  style={{ background: '#2563eb', fontWeight: 600 }}
                  title="Start live two-way conversational voice call"
                >
                  📞 Live Call
                </button>
                {!isActive ? (
                  <button className="btn btn-outline btn-sm" onClick={() => onSelectAgent(agent)}>
                    Select
                  </button>
                ) : (
                  <button className="btn btn-success btn-sm" disabled>
                    ✓ Selected
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => onTestAgent(agent)}>
                  🧪 Playground
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => openEditModal(agent)}>
                  ✏️ Edit
                </button>
                {!agent.is_default && (
                  <button 
                    className="btn btn-danger btn-sm" 
                    onClick={() => {
                      if (confirm(`Delete agent "${agent.name}"?`)) onDeleteAgent(agent.id);
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Agent Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingAgent ? `Edit Agent: ${editingAgent.name}` : 'Create New Voice Agent'}</h3>
              <button className="modal-close-btn" onClick={closeModal}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="agent-form">
              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Agent Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Maya, Jordan, Travel Scout"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Role / Tagline</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Customer Support Lead"
                    value={formRole}
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
                  <label className="form-label">Voice Model</label>
                  <select
                    className="form-select"
                    value={formVoiceId}
                    onChange={e => setFormVoiceId(e.target.value)}
                  >
                    {PRESET_VOICES.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">LLM Model</label>
                  <select
                    className="form-select"
                    value={formModel}
                    onChange={e => setFormModel(e.target.value)}
                  >
                    <option value="gpt-4o-mini">GPT-4o Mini (Fast & Low Latency)</option>
                    <option value="gpt-4o">GPT-4o (Maximum Intelligence)</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
                </div>

                <div className="form-group" style={{ width: '130px' }}>
                  <label className="form-label">Temperature: {formTemp}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    className="form-input"
                    value={formTemp}
                    onChange={e => setFormTemp(parseFloat(e.target.value))}
                  />
                </div>
              </div>

              {/* Initial Greeting (Agent Speaks First) */}
              <div className="form-group">
                <label className="form-label">🗣️ Initial Greeting (Agent Speaks First)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Hello! How can I assist you today?"
                  value={formGreeting}
                  onChange={e => setFormGreeting(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', display: 'block' }}>
                  The agent speaks this greeting aloud first when a call begins before listening to the user.
                </span>
              </div>

              {/* System Prompt */}
              <div className="form-group">
                <label className="form-label">System Prompt (Persona, Tone & Instructions)</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="You are a helpful voice assistant. Speak naturally in concise sentences..."
                  value={formPrompt}
                  onChange={e => setFormPrompt(e.target.value)}
                />
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
                              <span style={{ marginLeft: '0.4rem', background: '#3b82f6', color: '#fff', fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
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
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
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
    </div>
  );
}
