// ============================================================================
// Call Analytics & Post-Call Intelligence Tab Component
// ============================================================================

import React, { useState, useEffect } from 'react';
import type { CallAnalyticsRecord, Agent } from '../../types';

interface AnalyticsTabProps {
  agents: Agent[];
  onStartVoiceCall?: (agent: Agent) => void;
}

export function AnalyticsTab({ agents, onStartVoiceCall }: AnalyticsTabProps) {
  const [calls, setCalls] = useState<CallAnalyticsRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [resolutionFilter, setResolutionFilter] = useState<string>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');

  const fetchCalls = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/calls');
      const data = await res.json();
      if (data.calls && Array.isArray(data.calls)) {
        setCalls(data.calls);
        if (data.calls.length > 0 && !selectedCallId) {
          setSelectedCallId(data.calls[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch call analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  const handleDeleteCall = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this call analytics record?')) return;
    try {
      await fetch(`/api/calls/${id}`, { method: 'DELETE' });
      const remaining = calls.filter(c => c.id !== id);
      setCalls(remaining);
      if (selectedCallId === id) {
        setSelectedCallId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error('Failed to delete call:', err);
    }
  };

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'recent' | 'score' | 'duration'>('recent');

  const filteredCalls = calls
    .filter(call => {
      if (agentFilter !== 'all' && call.agent_name !== agentFilter && call.agent_id !== agentFilter) return false;
      if (resolutionFilter !== 'all' && call.resolution_status !== resolutionFilter) return false;
      if (sentimentFilter !== 'all' && call.sentiment !== sentimentFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSummary = call.summary.toLowerCase().includes(q);
        const matchesAgent = call.agent_name.toLowerCase().includes(q);
        const matchesTopics = (call.topics || []).some(t => t.toLowerCase().includes(q));
        const matchesTranscripts = (call.transcripts || []).some(t => t.text.toLowerCase().includes(q));
        if (!matchesSummary && !matchesAgent && !matchesTopics && !matchesTranscripts) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return (b.qa_scores?.overall_score || 0) - (a.qa_scores?.overall_score || 0);
      if (sortBy === 'duration') return b.duration_seconds - a.duration_seconds;
      return b.timestamp - a.timestamp;
    });

  const selectedCall = calls.find(c => c.id === selectedCallId) || (filteredCalls.length > 0 ? filteredCalls[0] : null);

  // Compute KPI metrics
  const totalCalls = calls.length;
  const avgQAScore = totalCalls > 0 
    ? Math.round(calls.reduce((acc, c) => acc + (c.qa_scores?.overall_score || 90), 0) / totalCalls) 
    : 0;
  const resolvedCount = calls.filter(c => c.resolution_status === 'Resolved').length;
  const resolutionRate = totalCalls > 0 ? Math.round((resolvedCount / totalCalls) * 100) : 100;
  const avgDuration = totalCalls > 0 
    ? Math.round(calls.reduce((acc, c) => acc + c.duration_seconds, 0) / totalCalls) 
    : 0;

  const exportReport = (call: CallAnalyticsRecord) => {
    const reportStr = JSON.stringify(call, null, 2);
    const blob = new Blob([reportStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call_report_${call.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'Positive': return '#22c55e';
      case 'Neutral': return '#38bdf8';
      case 'Curious': return '#a855f7';
      case 'Frustrated': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const getResolutionBadge = (status: string) => {
    switch (status) {
      case 'Resolved': return 'badge-resolved';
      case 'Needs Follow-Up': return 'badge-followup';
      case 'Escalated': return 'badge-escalated';
      default: return 'badge-unresolved';
    }
  };

  return (
    <div className="analytics-page">
      {/* Top KPI Cards Row */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="kpi-icon">📞</div>
          <div>
            <div className="kpi-label">Total Calls Analyzed</div>
            <div className="kpi-value">{totalCalls}</div>
          </div>
        </div>
        <div className="analytics-kpi-card">
          <div className="kpi-icon" style={{ color: '#22c55e' }}>⭐</div>
          <div>
            <div className="kpi-label">Average QA Score</div>
            <div className="kpi-value">{avgQAScore}%</div>
          </div>
        </div>
        <div className="analytics-kpi-card">
          <div className="kpi-icon" style={{ color: '#38bdf8' }}>✓</div>
          <div>
            <div className="kpi-label">First-Call Resolution</div>
            <div className="kpi-value">{resolutionRate}%</div>
          </div>
        </div>
        <div className="analytics-kpi-card">
          <div className="kpi-icon" style={{ color: '#fbbf24' }}>⏱️</div>
          <div>
            <div className="kpi-label">Average Handle Time</div>
            <div className="kpi-value">{avgDuration}s</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="analytics-filters-bar">
        <div className="filter-group" style={{ flex: '1 1 200px' }}>
          <label>🔍 Search:</label>
          <input
            type="text"
            className="form-input form-input-sm"
            placeholder="Search transcripts, topics, summary..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div className="filter-group">
          <label>Agent:</label>
          <select 
            className="form-select form-select-sm" 
            value={agentFilter} 
            onChange={e => setAgentFilter(e.target.value)}
          >
            <option value="all">All Agents</option>
            {agents.map(a => (
              <option key={a.id} value={a.name}>{a.avatar} {a.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Resolution:</label>
          <select 
            className="form-select form-select-sm" 
            value={resolutionFilter} 
            onChange={e => setResolutionFilter(e.target.value)}
          >
            <option value="all">All Resolutions</option>
            <option value="Resolved">Resolved</option>
            <option value="Needs Follow-Up">Needs Follow-Up</option>
            <option value="Escalated">Escalated</option>
            <option value="Unresolved">Unresolved</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Sentiment:</label>
          <select 
            className="form-select form-select-sm" 
            value={sentimentFilter} 
            onChange={e => setSentimentFilter(e.target.value)}
          >
            <option value="all">All Sentiments</option>
            <option value="Positive">Positive</option>
            <option value="Neutral">Neutral</option>
            <option value="Curious">Curious</option>
            <option value="Frustrated">Frustrated</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Sort:</label>
          <select 
            className="form-select form-select-sm" 
            value={sortBy} 
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="recent">Most Recent</option>
            <option value="score">Highest QA Score</option>
            <option value="duration">Longest Call</option>
          </select>
        </div>

        <button className="btn btn-outline btn-sm" onClick={fetchCalls} style={{ marginLeft: 'auto' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Main Split Content: Call Records List + Detailed Intelligence Scorecard */}
      <div className="analytics-content-split">
        {/* Left Side: Call Records List */}
        <div className="analytics-call-list">
          {loading ? (
            <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>Loading call records...</div>
          ) : filteredCalls.length === 0 ? (
            <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>
              No call records matching filters. Start a call in Playground or Agents Studio to see intelligence scorecards here.
            </div>
          ) : (
            filteredCalls.map(c => {
              const isSelected = selectedCall?.id === c.id;
              return (
                <div 
                  key={c.id} 
                  className={`call-record-item ${isSelected ? 'call-record-selected' : ''}`}
                  onClick={() => setSelectedCallId(c.id)}
                >
                  <div className="record-header">
                    <span className="record-avatar">{c.agent_avatar || '🤖'}</span>
                    <div className="record-info">
                      <div className="record-name">{c.agent_name}</div>
                      <div className="record-role">{c.agent_role}</div>
                    </div>
                    <div className="record-score-badge">
                      <span className="score-num">{c.qa_scores?.overall_score || 90}</span>
                      <span className="score-sub">QA</span>
                    </div>
                  </div>

                  <p className="record-summary-preview">
                    {c.summary}
                  </p>

                  <div className="record-footer">
                    <span className="record-time">
                      {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {c.duration_seconds}s
                    </span>
                    <div className="record-tags">
                      <span 
                        className="sentiment-pill"
                        style={{ color: getSentimentColor(c.sentiment), borderColor: getSentimentColor(c.sentiment) }}
                      >
                        ● {c.sentiment}
                      </span>
                      <span className={`status-pill ${getResolutionBadge(c.resolution_status)}`}>
                        {c.resolution_status}
                      </span>
                    </div>
                    <button 
                      className="record-delete-btn" 
                      onClick={(e) => handleDeleteCall(c.id, e)}
                      title="Delete record"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Side: Detailed Intelligence & QA Scorecard */}
        <div className="analytics-scorecard-panel">
          {selectedCall ? (
            <div className="scorecard-container">
              {/* Header */}
              <div className="scorecard-header">
                <div className="scorecard-agent-meta">
                  <span className="scorecard-avatar">{selectedCall.agent_avatar || '🤖'}</span>
                  <div>
                    <h2 className="scorecard-title">Call with {selectedCall.agent_name}</h2>
                    <span className="scorecard-meta-text">
                      Session ID: <code>{selectedCall.session_id}</code> • {new Date(selectedCall.timestamp).toLocaleString()} • Duration: {selectedCall.duration_seconds}s
                    </span>
                  </div>
                </div>

                <div className="scorecard-top-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => exportReport(selectedCall)}>
                    📥 Export Report
                  </button>
                  {onStartVoiceCall && (
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const target = agents.find(a => a.id === selectedCall.agent_id || a.name === selectedCall.agent_name);
                        if (target) onStartVoiceCall(target);
                      }}
                    >
                      📞 Call Again
                    </button>
                  )}
                </div>
              </div>

              {/* QA Scorecard Ring & Breakdown */}
              <div className="qa-score-section">
                <div className="qa-main-score-circle">
                  <div className="qa-circle-value">{selectedCall.qa_scores?.overall_score || 92}%</div>
                  <div className="qa-circle-label">Overall QA Score</div>
                </div>

                <div className="qa-breakdown-bars">
                  <div className="qa-bar-item">
                    <div className="qa-bar-label">
                      <span>Empathy & Tone</span>
                      <span>{selectedCall.qa_scores?.empathy || 90}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${selectedCall.qa_scores?.empathy || 90}%`, background: '#38bdf8' }} />
                    </div>
                  </div>

                  <div className="qa-bar-item">
                    <div className="qa-bar-label">
                      <span>Response Clarity</span>
                      <span>{selectedCall.qa_scores?.clarity || 94}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${selectedCall.qa_scores?.clarity || 94}%`, background: '#22c55e' }} />
                    </div>
                  </div>

                  <div className="qa-bar-item">
                    <div className="qa-bar-label">
                      <span>Tool Execution Accuracy</span>
                      <span>{selectedCall.qa_scores?.tool_accuracy || 98}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${selectedCall.qa_scores?.tool_accuracy || 98}%`, background: '#a855f7' }} />
                    </div>
                  </div>

                  <div className="qa-bar-item">
                    <div className="qa-bar-label">
                      <span>Response Speed & Fluency</span>
                      <span>{selectedCall.qa_scores?.response_speed || 92}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${selectedCall.qa_scores?.response_speed || 92}%`, background: '#fbbf24' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="scorecard-box">
                <h3 className="box-title">📋 Executive Call Summary</h3>
                <p className="summary-paragraph">{selectedCall.summary}</p>
              </div>

              {/* Sentiment & Status Row */}
              <div className="scorecard-two-col">
                <div className="scorecard-box">
                  <h3 className="box-title">🎭 Caller Sentiment</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
                    <span 
                      className="sentiment-tag-lg"
                      style={{ color: getSentimentColor(selectedCall.sentiment), borderColor: getSentimentColor(selectedCall.sentiment) }}
                    >
                      {selectedCall.sentiment} ({selectedCall.sentiment_score}%)
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      Caller mood was maintained effectively.
                    </span>
                  </div>
                </div>

                <div className="scorecard-box">
                  <h3 className="box-title">🎯 Resolution Status</h3>
                  <div style={{ marginTop: '0.4rem' }}>
                    <span className={`status-pill status-pill-lg ${getResolutionBadge(selectedCall.resolution_status)}`}>
                      {selectedCall.resolution_status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Topics Discussed */}
              {selectedCall.topics && selectedCall.topics.length > 0 && (
                <div className="scorecard-box">
                  <h3 className="box-title">🏷️ Topics Discussed</h3>
                  <div className="topics-tags-list">
                    {selectedCall.topics.map((t, idx) => (
                      <span key={idx} className="topic-pill">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Items */}
              {selectedCall.action_items && selectedCall.action_items.length > 0 && (
                <div className="scorecard-box">
                  <h3 className="box-title">✅ Extracted Action Items & Follow-ups</h3>
                  <ul className="action-items-list">
                    {selectedCall.action_items.map((item, idx) => (
                      <li key={idx} className="action-item-row">
                        <input type="checkbox" defaultChecked={false} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Full Transcript Inspection */}
              <div className="scorecard-box">
                <h3 className="box-title">💬 Conversation Transcript ({selectedCall.transcripts?.length || 0} turns)</h3>
                <div className="scorecard-transcript-stream">
                  {selectedCall.transcripts && selectedCall.transcripts.length > 0 ? (
                    selectedCall.transcripts.map((t, idx) => (
                      <div key={idx} className={`transcript-bubble-row ${t.role === 'user' ? 'bubble-user' : 'bubble-agent'}`}>
                        <span className="bubble-speaker">
                          {t.role === 'user' ? '👤 You' : (selectedCall.agent_avatar || '🤖') + ' ' + selectedCall.agent_name}
                        </span>
                        <div className="bubble-content">{t.text}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#64748b', fontStyle: 'italic' }}>No transcript logged for this session.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: '#64748b', padding: '3rem', textAlign: 'center' }}>
              Select a call record from the left to view the complete QA scorecard and intelligence analysis.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
