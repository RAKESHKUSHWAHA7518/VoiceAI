// ============================================================================
// Phase 9: Outbound Campaign Auto-Dialer & Lead Batch Calling Tab
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import type { Agent, Campaign } from '../../types';

interface CampaignsTabProps {
  agents: Agent[];
  onStartVoiceCall?: (agent: Agent) => void;
}

export function CampaignsTab({ agents, onStartVoiceCall }: CampaignsTabProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Form states for New Campaign
  const [newCampName, setNewCampName] = useState('');
  const [newCampDesc, setNewCampDesc] = useState('');
  const [newCampAgentId, setNewCampAgentId] = useState(agents[0]?.id || 'agent-1');
  const [newCampConcurrency, setNewCampConcurrency] = useState(5);
  const [newCampRetries, setNewCampRetries] = useState(2);
  const [newCampCsv, setNewCampCsv] = useState('');

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      if (data.success && data.campaigns) {
        setCampaigns(data.campaigns);
        if (!selectedCampaignId && data.campaigns.length > 0) {
          setSelectedCampaignId(data.campaigns[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    }
  }, [selectedCampaignId]);

  useEffect(() => {
    fetchCampaigns();
    const interval = setInterval(fetchCampaigns, 3000);
    return () => clearInterval(interval);
  }, [fetchCampaigns]);

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) || campaigns[0] || null;

  const handleStartCampaign = async (id: string) => {
    try {
      await fetch(`/api/campaigns/${id}/start`, { method: 'POST' });
      fetchCampaigns();
    } catch (err) {
      console.error('Start campaign error:', err);
    }
  };

  const handlePauseCampaign = async (id: string) => {
    try {
      await fetch(`/api/campaigns/${id}/pause`, { method: 'POST' });
      fetchCampaigns();
    } catch (err) {
      console.error('Pause campaign error:', err);
    }
  };

  const handleResetCampaign = async (id: string) => {
    try {
      await fetch(`/api/campaigns/${id}/reset`, { method: 'POST' });
      fetchCampaigns();
    } catch (err) {
      console.error('Reset campaign error:', err);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    try {
      await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      fetchCampaigns();
    } catch (err) {
      console.error('Delete campaign error:', err);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampName.trim()) return;

    const chosenAgent = agents.find(a => a.id === newCampAgentId) || agents[0];

    try {
      setIsLoading(true);
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampName,
          description: newCampDesc,
          agent_id: chosenAgent?.id || 'agent-1',
          agent_name: chosenAgent ? `${chosenAgent.name} (${chosenAgent.role})` : 'Voice AI Agent',
          concurrent_lines: newCampConcurrency,
          max_retries: newCampRetries,
          csv: newCampCsv,
        }),
      });
      const data = await res.json();
      if (data.success && data.campaign) {
        setIsCreateModalOpen(false);
        setNewCampName('');
        setNewCampDesc('');
        setNewCampCsv('');
        setSelectedCampaignId(data.campaign.id);
        fetchCampaigns();
      }
    } catch (err) {
      console.error('Create campaign error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportCsv = async () => {
    if (!selectedCampaign || !csvInput.trim()) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/campaigns/${selectedCampaign.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvInput }),
      });
      const data = await res.json();
      if (data.success) {
        setIsImportModalOpen(false);
        setCsvInput('');
        fetchCampaigns();
      }
    } catch (err) {
      console.error('Import CSV error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateDisposition = async (contactId: string, disposition: string) => {
    if (!selectedCampaign) return;
    try {
      await fetch(`/api/campaigns/${selectedCampaign.id}/contacts/${contactId}/disposition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disposition }),
      });
      fetchCampaigns();
    } catch (err) {
      console.error('Disposition update error:', err);
    }
  };

  // Aggregated KPI Stats
  const totalCampaigns = campaigns.length;
  const totalLeads = campaigns.reduce((acc, c) => acc + c.total_leads, 0);
  const totalCompleted = campaigns.reduce((acc, c) => acc + c.completed_calls, 0);
  const totalConnected = campaigns.reduce((acc, c) => acc + c.connected_calls, 0);
  const overallConnectRate = totalCompleted > 0 ? Math.round((totalConnected / totalCompleted) * 100) : 0;
  const runningDialers = campaigns.filter(c => c.status === 'running').length;

  // Filtered contacts for selected campaign
  const contacts = selectedCampaign?.contacts || [];
  const filteredContacts = contacts.filter(c => {
    if (statusFilter === 'all') return true;
    return c.status === statusFilter;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner & Action */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1.25rem',
          background: 'var(--studio-surface)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📞</span>
            <h2 className="header-title">
              Outbound Campaign Auto-Dialer & Batch Calling
            </h2>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '0.2rem 0.55rem',
                borderRadius: '999px',
                background: runningDialers > 0 ? 'rgba(var(--studio-success-rgb), 0.2)' : 'rgba(var(--studio-secondary-rgb), 0.15)',
                color: runningDialers > 0 ? 'var(--studio-success)' : 'var(--studio-secondary)',
                border: runningDialers > 0 ? '1px solid rgba(var(--studio-success-rgb), 0.4)' : '1px solid rgba(var(--studio-secondary-rgb), 0.2)',
              }}
            >
              {runningDialers > 0 ? `● ${runningDialers} DIALER ACTIVE` : 'ALL DIALERS IDLE'}
            </span>
          </div>
          <p style={{ margin: '0.4rem 0 0 0', color: 'var(--studio-secondary)', fontSize: '0.85rem' }}>
            Orchestrate progressive & predictive voice AI outbound campaigns with live CSV lead lists, call concurrency, and automated call dispositions.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 700,
              padding: '0.65rem 1.25rem',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(var(--studio-accent-rgb), 0.25)',
            }}
          >
            <span>+</span>
            <span>New Outbound Campaign</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-title">TOTAL CAMPAIGNS</div>
          <div className="analytics-kpi-value">{totalCampaigns}</div>
          <div className="analytics-kpi-sub">
            <span>{runningDialers} currently active</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-title">TOTAL LEADS IN SYSTEM</div>
          <div className="analytics-kpi-value">{totalLeads}</div>
          <div className="analytics-kpi-sub">
            <span style={{ color: 'var(--studio-accent)' }}>{totalCompleted} calls completed</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-title">OVERALL CONNECTION RATE</div>
          <div className="analytics-kpi-value">{overallConnectRate}%</div>
          <div className="analytics-kpi-sub">
            <span style={{ color: 'var(--studio-success)' }}>{totalConnected} live pickups</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-title">ALLOCATED CONCURRENT LINES</div>
          <div className="analytics-kpi-value">
            {campaigns.reduce((acc, c) => acc + (c.status === 'running' ? c.concurrent_lines : 0), 0)}
          </div>
          <div className="analytics-kpi-sub">
            <span>Up to 50 max carrier trunks</span>
          </div>
        </div>
      </div>

      {/* Main Campaign Management Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Column: Campaigns List */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Active Campaigns</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--studio-muted)' }}>{campaigns.length} total</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {campaigns.map(camp => {
              const isSelected = selectedCampaign?.id === camp.id;
              const percent = camp.total_leads > 0 ? Math.round((camp.completed_calls / camp.total_leads) * 100) : 0;

              return (
                <div
                  key={camp.id}
                  onClick={() => setSelectedCampaignId(camp.id)}
                  style={{
                    padding: '1rem',
                    borderRadius: '10px',
                    border: isSelected
                      ? '1px solid rgba(var(--studio-accent-rgb), 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.06)',
                    background: isSelected
                      ? 'var(--studio-surface)'
                      : 'rgba(var(--studio-inset-rgb), 0.5)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 4px 20px rgba(var(--studio-accent-rgb), 0.15)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--studio-text)' }}>
                      {camp.name}
                    </h4>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background:
                          camp.status === 'running'
                            ? 'rgba(var(--studio-success-rgb), 0.2)'
                            : camp.status === 'paused'
                            ? 'rgba(var(--studio-warning-rgb), 0.2)'
                            : camp.status === 'completed'
                            ? 'rgba(var(--studio-accent-rgb), 0.2)'
                            : 'rgba(var(--studio-secondary-rgb), 0.2)',
                        color:
                          camp.status === 'running'
                            ? 'var(--studio-success)'
                            : camp.status === 'paused'
                            ? 'var(--studio-warning)'
                            : camp.status === 'completed'
                            ? 'var(--studio-accent)'
                            : 'var(--studio-secondary)',
                      }}
                    >
                      {camp.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--studio-secondary)', marginBottom: '0.65rem' }}>
                    Agent: <strong style={{ color: 'var(--studio-secondary)' }}>{camp.agent_name}</strong> • Concurrency: {camp.concurrent_lines} lines
                  </div>

                  {/* Progress Bar */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--studio-secondary)', marginBottom: '0.25rem' }}>
                      <span>Progress: {camp.completed_calls} / {camp.total_leads}</span>
                      <span>{percent}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${percent}%`,
                          height: '100%',
                          background: camp.status === 'running' ? 'var(--studio-success)' : 'var(--studio-accent)',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Quick Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                    {camp.status === 'running' ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                        onClick={(e) => { e.stopPropagation(); handlePauseCampaign(camp.id); }}
                      >
                        ⏸ Pause
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', background: 'var(--studio-success-strong)', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); handleStartCampaign(camp.id); }}
                      >
                        ▶ Start
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                      title="Reset progress"
                      onClick={(e) => { e.stopPropagation(); handleResetCampaign(camp.id); }}
                    >
                      🔄 Reset
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', color: 'var(--studio-danger)' }}
                      title="Delete campaign"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(camp.id); }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Campaign Details & Live Lead Roster */}
        {selectedCampaign ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Campaign Summary & Disposition Matrix */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{selectedCampaign.name}</h3>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--studio-secondary)' }}>
                    {selectedCampaign.description}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsImportModalOpen(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
                  >
                    <span>📥</span>
                    <span>Import CSV Leads</span>
                  </button>
                  {selectedCampaign.status === 'running' ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handlePauseCampaign(selectedCampaign.id)}
                    >
                      ⏸ Pause Auto-Dialer
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      style={{ background: 'var(--studio-success-strong)', border: 'none' }}
                      onClick={() => handleStartCampaign(selectedCampaign.id)}
                    >
                      ▶ Launch Auto-Dialer
                    </button>
                  )}
                </div>
              </div>

              {/* Disposition Pills Breakdown */}
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--studio-secondary)', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
                  Disposition Distribution:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {Object.entries(selectedCampaign.disposition_breakdown || {}).length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'var(--studio-muted)' }}>No calls logged yet</span>
                  ) : (
                    Object.entries(selectedCampaign.disposition_breakdown).map(([disp, count]) => (
                      <div
                        key={disp}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                        }}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--studio-secondary)' }}>{disp}:</span>
                        <strong style={{ color: 'var(--studio-accent)' }}>{count}</strong>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Leads Table */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                  Lead Call Registry ({filteredContacts.length} contacts)
                </h4>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--studio-secondary)' }}>Filter Status:</label>
                  <select
                    className="form-select form-select-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
                  >
                    <option value="all">All ({contacts.length})</option>
                    <option value="pending">Pending</option>
                    <option value="dialing">Dialing</option>
                    <option value="connected">Connected</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed / Busy</option>
                  </select>
                </div>
              </div>

              {filteredContacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--studio-muted)', fontSize: '0.85rem' }}>
                  No contacts found matching the filter.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="telephony-table" style={{ width: '100%', fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>Lead Name</th>
                        <th>Phone Number</th>
                        <th>Organization</th>
                        <th>Status</th>
                        <th>Disposition</th>
                        <th>Duration</th>
                        <th>Outcome Summary</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.map(c => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600, color: 'var(--studio-text)' }}>{c.name}</td>
                          <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: 'var(--studio-accent)' }}>
                            {c.phone_number}
                          </td>
                          <td style={{ color: 'var(--studio-secondary)' }}>{c.company || '—'}</td>
                          <td>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                background:
                                  c.status === 'completed'
                                    ? 'rgba(var(--studio-success-rgb), 0.15)'
                                    : c.status === 'dialing'
                                    ? 'rgba(var(--studio-accent-rgb), 0.25)'
                                    : c.status === 'failed'
                                    ? 'rgba(var(--studio-danger-rgb), 0.15)'
                                    : 'rgba(var(--studio-secondary-rgb), 0.15)',
                                color:
                                  c.status === 'completed'
                                    ? 'var(--studio-success)'
                                    : c.status === 'dialing'
                                    ? 'var(--studio-accent)'
                                    : c.status === 'failed'
                                    ? 'var(--studio-danger)'
                                    : 'var(--studio-secondary)',
                              }}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td>
                            <select
                              value={c.disposition}
                              onChange={(e) => handleUpdateDisposition(c.id, e.target.value)}
                              style={{
                                background: 'rgba(var(--studio-inset-rgb), 0.6)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                color: 'var(--studio-text)',
                                fontSize: '0.72rem',
                                borderRadius: '4px',
                                padding: '0.2rem 0.4rem',
                              }}
                            >
                              <option value="Pending">Pending</option>
                              <option value="Interested">Interested</option>
                              <option value="Scheduled Demo">Scheduled Demo</option>
                              <option value="Call Back Later">Call Back Later</option>
                              <option value="Voicemail Left">Voicemail Left</option>
                              <option value="Not Interested">Not Interested</option>
                              <option value="Unreachable">Unreachable</option>
                            </select>
                          </td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--studio-secondary)' }}>
                            {c.duration_sec > 0 ? `${c.duration_sec}s` : '—'}
                          </td>
                          <td style={{ maxWidth: '240px', color: 'var(--studio-secondary)', fontSize: '0.78rem' }}>
                            {c.summary || '—'}
                          </td>
                          <td>
                            {onStartVoiceCall && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{
                                  padding: '0.2rem 0.5rem',
                                  fontSize: '0.72rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  cursor: 'pointer',
                                }}
                                onClick={() => {
                                  const targetAgent = agents.find(a => a.id === selectedCampaign.agent_id) || agents[0];
                                  if (targetAgent) onStartVoiceCall(targetAgent);
                                }}
                                title="Directly launch live test call with assigned voice agent"
                              >
                                <span>📞</span>
                                <span>Call</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--studio-muted)' }}>
            Select a campaign on the left or create a new one to begin.
          </div>
        )}
      </div>

      {/* Modal: Create Campaign */}
      {isCreateModalOpen && (
        <div className="telephony-modal-overlay">
          <div className="telephony-modal" style={{ maxWidth: '620px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Create Outbound Voice Campaign</h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsCreateModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="form-label">Campaign Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Q4 Executive Renewal Outreach"
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label">Description & Objective</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Describe the campaign mission and expected outcome..."
                  value={newCampDesc}
                  onChange={(e) => setNewCampDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label">Assigned AI Agent</label>
                  <select
                    className="form-select"
                    value={newCampAgentId}
                    onChange={(e) => setNewCampAgentId(e.target.value)}
                  >
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.avatar} {a.name} ({a.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Concurrency ({newCampConcurrency} lines)</label>
                  <input
                    type="range"
                    className="form-input"
                    min={1}
                    max={25}
                    value={newCampConcurrency}
                    onChange={(e) => setNewCampConcurrency(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="form-label">Max Retries ({newCampRetries} attempts)</label>
                  <input
                    type="range"
                    className="form-input"
                    min={1}
                    max={5}
                    value={newCampRetries}
                    onChange={(e) => setNewCampRetries(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Import Initial Leads (CSV Format)</label>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--studio-accent)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => {
                      setNewCampCsv(`Name,Phone Number,Company,Notes
Dr. Gregory House,+1 (555) 710-8291,Princeton Plainsboro,Internal Medicine Checkup
Allison Cameron,+1 (555) 624-9183,Mercy Hospital,Immunology Pre-Op Consultation
Robert Chase,+1 (555) 843-1920,St. Sebastian Ortho,Surgical Follow-up`);
                    }}
                  >
                    Insert Sample Hospital Leads
                  </button>
                </div>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder={`Name,Phone Number,Company\nJane Doe,+1 (555) 234-5678,Acme Corp`}
                  value={newCampCsv}
                  onChange={(e) => setNewCampCsv(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import CSV Leads into Selected Campaign */}
      {isImportModalOpen && selectedCampaign && (
        <div className="telephony-modal-overlay">
          <div className="telephony-modal" style={{ maxWidth: '580px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                Import CSV Leads — {selectedCampaign.name}
              </h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsImportModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--studio-secondary)' }}>
                Paste CSV data with headers (Name, Phone Number, Company, etc.). Contacts will be queued into the dialer immediately.
              </p>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--studio-muted)' }}>CSV Content:</span>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--studio-accent)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => {
                      setCsvInput(`Name,Phone Number,Company,Variable
Samantha Carter,+1 (555) 912-4019,SGC Aerospace,Telemetry Review
Daniel Jackson,+1 (555) 813-7201,Cheyenne Mountain,Cultural Briefing`);
                    }}
                  >
                    Insert Demo Leads
                  </button>
                </div>
                <textarea
                  className="form-textarea"
                  rows={6}
                  placeholder={`Name,Phone Number,Company\nJohn Doe,+1 (555) 123-4567,Acme Inc`}
                  value={csvInput}
                  onChange={(e) => setCsvInput(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsImportModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleImportCsv}
                  disabled={isLoading || !csvInput.trim()}
                >
                  {isLoading ? 'Importing...' : 'Append Leads'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
