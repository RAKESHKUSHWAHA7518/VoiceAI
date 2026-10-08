// ============================================================================
// Agents Studio Component
// ============================================================================

import React, { useState } from 'react';
import type { Agent } from '../../types';

interface AgentsTabProps {
  agents: Agent[];
  activeAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  onSaveAgent: (agent: Partial<Agent>) => Promise<void>;
  onDeleteAgent: (agentId: string) => Promise<void>;
  onTestAgent: (agent: Agent) => void;
  isCreatingNew?: boolean;
  setIsCreatingNew?: (val: boolean) => void;
}

const AVAILABLE_TOOLS = [
  { id: 'get_weather', name: 'get_weather', label: '🌤️ Live Weather', desc: 'Real-time forecasts and weather conditions' },
  { id: 'check_booking', name: 'check_booking', label: '📋 Booking Lookup', desc: 'Verify reservations, dates, and party sizes' },
  { id: 'transfer_call', name: 'transfer_call', label: '📞 Call Transfer', desc: 'Route caller to specific departments' },
];

const PRESET_AVATARS = ['🎧', '🌤️', '🏨', '🩺', '🚀', '💼', '🤖', '🎯', '⚖️', '🧑‍🏫', '🛍️', '💡'];

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
  isCreatingNew,
  setIsCreatingNew,
}: AgentsTabProps) {
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showModal, setShowModal] = useState(isCreatingNew || false);

  // Form state
  const [formId, setFormId] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formRole, setFormRole] = useState<string>('');
  const [formAvatar, setFormAvatar] = useState<string>('🤖');
  const [formVoiceId, setFormVoiceId] = useState<string>(PRESET_VOICES[0].id);
  const [formModel, setFormModel] = useState<string>('gpt-4o-mini');
  const [formTemp, setFormTemp] = useState<number>(0.3);
  const [formPrompt, setFormPrompt] = useState<string>('');
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
                {!isActive ? (
                  <button className="btn btn-primary btn-sm" onClick={() => onSelectAgent(agent)}>
                    Select Agent
                  </button>
                ) : (
                  <button className="btn btn-success btn-sm" disabled>
                    ✓ Selected
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => onTestAgent(agent)}>
                  🧪 Test Agent
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
                <label className="form-label">Assigned Function Tools</label>
                <div className="tools-selection-grid">
                  {AVAILABLE_TOOLS.map(t => {
                    const checked = formTools.includes(t.id);
                    return (
                      <label key={t.id} className={`tool-select-card ${checked ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleTool(t.id)}
                        />
                        <div className="tool-select-meta">
                          <span className="tool-select-title">{t.label}</span>
                          <span className="tool-select-desc">{t.desc}</span>
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
