// ============================================================================
// VoiceAI - Human-in-the-Loop (HITL) Live Call Takeover & Warm Transfer Tab
// Enterprise Master-Detail Operator Console
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import type { HITLActiveCall, Agent, CopilotSuggestion } from '../../types';
import {
  IconHeadphones,
  IconUserCheck,
  IconAlertTriangle,
  IconRadio,
  IconPhone,
  IconMic,
  IconRefresh,
  IconSparkles,
  IconClock,
  IconSearch,
  IconClose,
  IconCopy,
  IconCheck,
  IconVolume,
  PersonaAvatar,
} from '../common/Icons';

interface HITLTabProps {
  agents: Agent[];
  playVoice?: (text: string) => void;
}

export function HITLTab({ agents: _agents, playVoice }: HITLTabProps) {
  const [calls, setCalls] = useState<HITLActiveCall[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'all' | 'escalated' | 'telephony' | 'browser'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Simulation state
  const [simulatedInput, setSimulatedInput] = useState<string>('');
  const [simulatingMessage, setSimulatingMessage] = useState<boolean>(false);

  // Transfer modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [transferPhone, setTransferPhone] = useState<string>('+1 (800) 555-0199');
  const [transferDept, setTransferDept] = useState<string>('Tier 2 Escalations Team');
  const [transferring, setTransferring] = useState<boolean>(false);

  // Copilot copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Audio wave animation in Takeover mode
  const [micActiveWaves, setMicActiveWaves] = useState<number[]>([20, 45, 80, 50, 30, 15]);
  const waveIntervalRef = useRef<any>(null);

  // Fetch active calls
  const fetchCalls = async () => {
    try {
      const res = await fetch('/api/hitl/active-calls');
      const data = await res.json();
      if (data.success && Array.isArray(data.calls)) {
        setCalls(data.calls);
        if (!selectedCallId && data.calls.length > 0) {
          // Default select the escalated call if available, otherwise first call
          const escalated = data.calls.find((c: HITLActiveCall) => c.is_escalated);
          setSelectedCallId(escalated ? escalated.id : data.calls[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch active HITL calls:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
    const interval = setInterval(fetchCalls, 3000); // Polling every 3s
    return () => clearInterval(interval);
  }, []);

  const selectedCall = calls.find((c) => c.id === selectedCallId) || calls[0];

  // Animate microphone waveform when supervisor is in takeover mode
  useEffect(() => {
    if (selectedCall?.status === 'supervisor_takeover') {
      waveIntervalRef.current = setInterval(() => {
        setMicActiveWaves([
          Math.floor(15 + Math.random() * 65),
          Math.floor(25 + Math.random() * 70),
          Math.floor(35 + Math.random() * 60),
          Math.floor(20 + Math.random() * 75),
          Math.floor(10 + Math.random() * 50),
          Math.floor(25 + Math.random() * 65),
        ]);
      }, 100);
    } else {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
      setMicActiveWaves([10, 15, 10, 15, 10, 10]);
    }
    return () => {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    };
  }, [selectedCall?.status]);

  // Actions
  const handleWhisper = async () => {
    if (!selectedCall) return;
    try {
      const res = await fetch(`/api/hitl/calls/${selectedCall.id}/whisper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supervisor_name: 'Lead Supervisor Sarah' }),
      });
      const data = await res.json();
      if (data.success) {
        setCalls((prev) => prev.map((c) => (c.id === selectedCall.id ? data.call : c)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTakeover = async () => {
    if (!selectedCall) return;
    try {
      const res = await fetch(`/api/hitl/calls/${selectedCall.id}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supervisor_name: 'Lead Supervisor Sarah' }),
      });
      const data = await res.json();
      if (data.success) {
        setCalls((prev) => prev.map((c) => (c.id === selectedCall.id ? data.call : c)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleHandback = async () => {
    if (!selectedCall) return;
    try {
      const res = await fetch(`/api/hitl/calls/${selectedCall.id}/handback`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setCalls((prev) => prev.map((c) => (c.id === selectedCall.id ? data.call : c)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCall || !transferPhone) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/hitl/calls/${selectedCall.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_phone: transferPhone, department: transferDept }),
      });
      const data = await res.json();
      if (data.success) {
        setCalls((prev) => prev.map((c) => (c.id === selectedCall.id ? data.call : c)));
        setIsTransferModalOpen(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTransferring(false);
    }
  };

  const handleSendSimulatedMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCall || !simulatedInput.trim()) return;
    setSimulatingMessage(true);
    try {
      const res = await fetch(`/api/hitl/calls/${selectedCall.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', text: simulatedInput }),
      });
      const data = await res.json();
      if (data.success) {
        setCalls((prev) => prev.map((c) => (c.id === selectedCall.id ? data.call : c)));
        setSimulatedInput('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimulatingMessage(false);
    }
  };

  const handleCopySuggestion = (sug: CopilotSuggestion) => {
    navigator.clipboard.writeText(sug.text);
    setCopiedId(sug.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSpeakSuggestion = (sug: CopilotSuggestion) => {
    if (playVoice) {
      playVoice(sug.text);
    }
  };

  // Filtered calls list
  const filteredCalls = calls.filter((c) => {
    if (filterMode === 'escalated' && !c.is_escalated) return false;
    if (filterMode === 'telephony' && c.channel !== 'telephony') return false;
    if (filterMode === 'browser' && c.channel !== 'browser') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.caller_name.toLowerCase().includes(q) ||
        c.caller_phone.includes(q) ||
        c.agent_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const escalatedCount = calls.filter((c) => c.is_escalated).length;
  const takeoverCount = calls.filter((c) => c.status === 'supervisor_takeover').length;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string, isEscalated: boolean) => {
    if (isEscalated && status !== 'supervisor_takeover' && status !== 'transferred') {
      return (
        <span style={{
          background: 'rgba(239, 68, 68, 0.2)',
          color: '#f87171',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '20px',
          padding: '3px 9px',
          fontSize: '0.75rem',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
          Escalated Alert
        </span>
      );
    }
    switch (status) {
      case 'supervisor_takeover':
        return (
          <span style={{
            background: 'rgba(168, 85, 247, 0.2)',
            color: '#c084fc',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            borderRadius: '20px',
            padding: '3px 9px',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}>
            🎙️ Supervisor Takeover
          </span>
        );
      case 'whisper_listening':
        return (
          <span style={{
            background: 'rgba(56, 189, 248, 0.2)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '20px',
            padding: '3px 9px',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}>
            🎧 Whisper Monitoring
          </span>
        );
      case 'transferred':
        return (
          <span style={{
            background: 'rgba(234, 179, 8, 0.2)',
            color: '#facc15',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            borderRadius: '20px',
            padding: '3px 9px',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}>
            📞 Warm Transferred
          </span>
        );
      default:
        return (
          <span style={{
            background: 'rgba(34, 197, 94, 0.2)',
            color: '#4ade80',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            borderRadius: '20px',
            padding: '3px 9px',
            fontSize: '0.75rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
            AI Active
          </span>
        );
    }
  };

  return (
    <div className="tab-pane active" style={{ animation: 'fadeIn 0.25s ease-in-out' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2))',
              padding: '0.5rem',
              borderRadius: '8px',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              display: 'flex',
              alignItems: 'center'
            }}>
              <IconHeadphones size={24} color="#c084fc" />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Live Call Takeover & Supervision (HITL)
            </h1>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
            Enterprise human-in-the-loop console: silently listen in (Whisper), instantly take over angry callers with mic bridging (AI Muted), and execute warm telephony transfers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          {loading && (
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Syncing lines...</span>
          )}
          <button
            className="btn btn-secondary"
            onClick={fetchCalls}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}
          >
            <IconRefresh size={14} />
            <span>Refresh Lines</span>
          </button>
        </div>
      </div>

      {/* 4 Metric Badges */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div className="card" style={{ padding: '1rem 1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
          <div style={{ fontSize: '0.82rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
            <IconRadio size={14} color="#38bdf8" />
            Active Conversations
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc' }}>
            {calls.length}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
          <div style={{ fontSize: '0.82rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
            <IconAlertTriangle size={14} color="#f87171" />
            Escalations Pending
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: escalatedCount > 0 ? '#f87171' : '#f8fafc' }}>
            {escalatedCount}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
          <div style={{ fontSize: '0.82rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
            <IconUserCheck size={14} color="#c084fc" />
            Supervisor Takeovers
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#c084fc' }}>
            {takeoverCount}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
          <div style={{ fontSize: '0.82rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
            <IconHeadphones size={14} color="#4ade80" />
            Active Mode
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4ade80', marginTop: '0.35rem' }}>
            {selectedCall?.status === 'supervisor_takeover' ? '🎙️ Mic Bridged' : selectedCall?.status === 'whisper_listening' ? '🎧 Silent Whisper' : '🤖 AI Autonomous'}
          </div>
        </div>
      </div>

      {/* Main Master-Detail Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Column: Active Calls Directory */}
        <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Active Lines</h3>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{filteredCalls.length} calls</span>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative', marginBottom: '0.85rem' }}>
            <input
              type="text"
              className="input"
              placeholder="Search caller name, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '2.1rem', fontSize: '0.85rem' }}
            />
            <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>
              <IconSearch size={14} />
            </span>
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1rem', background: 'rgba(15, 23, 42, 0.6)', padding: '3px', borderRadius: '6px' }}>
            {(['all', 'escalated', 'telephony', 'browser'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setFilterMode(m)}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  border: 'none',
                  background: filterMode === m ? '#2563eb' : 'transparent',
                  color: filterMode === m ? '#fff' : '#94a3b8',
                  fontWeight: filterMode === m ? 600 : 400,
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Call list items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '560px', overflowY: 'auto' }}>
            {filteredCalls.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b', fontSize: '0.88rem' }}>
                No active calls in this view.
              </div>
            ) : (
              filteredCalls.map((call) => {
                const isSelected = selectedCall?.id === call.id;
                return (
                  <div
                    key={call.id}
                    onClick={() => setSelectedCallId(call.id)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(37, 99, 235, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                      border: isSelected ? '1.5px solid #3b82f6' : call.is_escalated ? '1.5px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#f8fafc' }}>
                        {call.caller_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                        <IconClock size={12} />
                        <span>{formatDuration(call.duration_seconds)}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <IconPhone size={12} color="#60a5fa" />
                      <span>{call.caller_phone}</span>
                      <span style={{ opacity: 0.5 }}>•</span>
                      <span>{call.channel.toUpperCase()}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {getStatusBadge(call.status, call.is_escalated)}

                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: call.current_sentiment === 'Positive' ? '#4ade80' : call.current_sentiment === 'Frustrated' ? '#f87171' : '#facc15'
                      }}>
                        {call.current_sentiment === 'Positive' ? '😊' : call.current_sentiment === 'Frustrated' ? '😡' : '😐'} {call.sentiment_score}%
                      </span>
                    </div>

                    {call.is_escalated && (
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#f87171',
                        fontSize: '0.73rem',
                        lineHeight: 1.3
                      }}>
                        ⚠️ {call.escalation_reason || 'Human supervisor requested'}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Live Call Supervision Console */}
        {selectedCall ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Call Header Card */}
            <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <PersonaAvatar name={selectedCall.agent_name} role={selectedCall.agent_role} size={42} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>
                        {selectedCall.caller_name}
                      </h2>
                      {getStatusBadge(selectedCall.status, selectedCall.is_escalated)}
                    </div>
                    <div style={{ fontSize: '0.84rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                      Handling Agent: <strong style={{ color: '#e2e8f0' }}>{selectedCall.agent_name}</strong> ({selectedCall.agent_role}) • Phone: {selectedCall.caller_phone} • Duration: {formatDuration(selectedCall.duration_seconds)}
                    </div>
                  </div>
                </div>

                {/* Supervisor Action Deck */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {selectedCall.status === 'supervisor_takeover' ? (
                    <button
                      className="btn"
                      onClick={handleHandback}
                      style={{
                        background: '#059669',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        fontSize: '0.84rem'
                      }}
                    >
                      <IconCheck size={15} />
                      <span>Hand Back to AI</span>
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn btn-secondary"
                        onClick={handleWhisper}
                        disabled={selectedCall.status === 'whisper_listening'}
                        title="Listen in silently without caller knowing"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem' }}
                      >
                        <IconHeadphones size={15} color="#38bdf8" />
                        <span>{selectedCall.status === 'whisper_listening' ? 'Listening in Whisper' : 'Whisper Listen'}</span>
                      </button>

                      <button
                        className="btn"
                        onClick={handleTakeover}
                        style={{
                          background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                          color: '#fff',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          fontSize: '0.84rem'
                        }}
                      >
                        <IconMic size={15} />
                        <span>🎙️ Take Over Call</span>
                      </button>
                    </>
                  )}

                  <button
                    className="btn btn-secondary"
                    onClick={() => setIsTransferModalOpen(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.84rem' }}
                  >
                    <IconPhone size={15} color="#facc15" />
                    <span>Warm Transfer</span>
                  </button>
                </div>
              </div>

              {/* Takeover Audio Bridge Bar (if takeover active) */}
              {selectedCall.status === 'supervisor_takeover' && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: 'linear-gradient(90deg, rgba(168, 85, 247, 0.2), rgba(37, 99, 235, 0.2))',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: '#a855f7',
                      animation: 'pulse 1s infinite'
                    }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                      SUPERVISOR MICROPHONE BRIDGED TO CALLER • AI AGENT MUTED
                    </span>
                  </div>

                  {/* Animated audio bars */}
                  <div style={{ display: 'flex', gap: '3px', alignItems: 'center', height: '24px' }}>
                    {micActiveWaves.map((h, i) => (
                      <div
                        key={i}
                        style={{
                          width: '4px',
                          height: `${h}%`,
                          background: '#a855f7',
                          borderRadius: '2px',
                          transition: 'height 0.08s ease'
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live Dual Transcript Feed */}
            <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Real-Time Dialogue Stream</h3>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Live Sentiment: <strong style={{ color: selectedCall.current_sentiment === 'Positive' ? '#4ade80' : selectedCall.current_sentiment === 'Frustrated' ? '#f87171' : '#facc15' }}>{selectedCall.current_sentiment} ({selectedCall.sentiment_score}%)</strong>
                </span>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                maxHeight: '380px',
                overflowY: 'auto',
                padding: '0.5rem',
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '8px'
              }}>
                {selectedCall.transcripts.map((t) => {
                  const isUser = t.role === 'user';
                  const isSupervisor = t.role === 'supervisor';
                  return (
                    <div
                      key={t.id}
                      style={{
                        alignSelf: isUser ? 'flex-start' : 'flex-end',
                        maxWidth: '80%',
                        padding: '0.75rem 0.95rem',
                        borderRadius: '10px',
                        background: isSupervisor ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(124, 58, 237, 0.25))' : isUser ? 'rgba(30, 41, 59, 0.9)' : 'linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(56, 189, 248, 0.25))',
                        border: isSupervisor ? '1px solid rgba(168, 85, 247, 0.4)' : isUser ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(56, 189, 248, 0.3)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: isSupervisor ? '#c084fc' : isUser ? '#94a3b8' : '#38bdf8' }}>
                          {isSupervisor ? '🎙️ Supervisor (Sarah)' : isUser ? `Caller (${selectedCall.caller_name})` : `🤖 AI Agent (${selectedCall.agent_name})`}
                        </span>
                        {t.sentiment && isUser && (
                          <span style={{
                            fontSize: '0.7rem',
                            color: t.sentiment === 'Positive' ? '#4ade80' : t.sentiment === 'Frustrated' ? '#f87171' : '#facc15'
                          }}>
                            {t.sentiment === 'Positive' ? '😊 Positive' : t.sentiment === 'Frustrated' ? '😡 Frustrated' : '😐 Neutral'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.88rem', color: '#f1f5f9', lineHeight: 1.45 }}>
                        {t.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Simulation bar for testing escalation triggers */}
              <form onSubmit={handleSendSimulatedMessage} style={{ marginTop: '0.85rem', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Simulate caller speech (e.g. 'I want to talk to your manager', 'I want a full refund')..."
                  value={simulatedInput}
                  onChange={(e) => setSimulatedInput(e.target.value)}
                  style={{ flex: 1, fontSize: '0.84rem' }}
                />
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={!simulatedInput.trim() || simulatingMessage}
                  style={{ fontSize: '0.84rem' }}
                >
                  {simulatingMessage ? 'Sending...' : 'Speak As Caller'}
                </button>
              </form>
            </div>

            {/* AI Whisper Copilot Card */}
            <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <IconSparkles size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                  AI Whisper Copilot (Supervisor Assistance)
                </h3>
              </div>
              <p style={{ margin: '0 0 0.85rem 0', color: '#94a3b8', fontSize: '0.84rem' }}>
                Context-grounded talking points suggested dynamically for the human supervisor to de-escalate and resolve this turn:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {selectedCall.copilot_suggestions.map((sug) => (
                  <div
                    key={sug.id}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ flex: 1, fontSize: '0.87rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                      "{sug.text}"
                    </div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexShrink: 0 }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleCopySuggestion(sug)}
                        style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        {copiedId === sug.id ? <IconCheck size={13} color="#4ade80" /> : <IconCopy size={13} />}
                        <span>{copiedId === sug.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      {playVoice && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSpeakSuggestion(sug)}
                          title="Preview how this sounds"
                          style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                        >
                          <IconVolume size={13} color="#60a5fa" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Select an active call to begin supervision.
          </div>
        )}
      </div>

      {/* Warm Transfer Modal */}
      {isTransferModalOpen && selectedCall && (
        <div className="modal-overlay" onClick={() => setIsTransferModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <IconPhone size={20} color="#facc15" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Warm SIP / PSTN Transfer</h3>
              </div>
              <button className="btn-icon" onClick={() => setIsTransferModalOpen(false)}>
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.84rem', color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
                  Target Phone Number / SIP URI:
                </label>
                <input
                  type="text"
                  className="input"
                  value={transferPhone}
                  onChange={(e) => setTransferPhone(e.target.value)}
                  placeholder="+1 (800) 555-0199"
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.84rem', color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
                  Destination Department Queue:
                </label>
                <select
                  className="select"
                  value={transferDept}
                  onChange={(e) => setTransferDept(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="Tier 2 Escalations Team">Tier 2 Escalations Team</option>
                  <option value="Retention & Loyalty Desk">Retention & Loyalty Desk</option>
                  <option value="Billing & Refund Specialist">Billing & Refund Specialist</option>
                  <option value="Technical Support Level 3">Technical Support Level 3</option>
                </select>
              </div>

              <div style={{
                padding: '0.75rem',
                borderRadius: '6px',
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.25)',
                fontSize: '0.82rem',
                color: '#facc15'
              }}>
                ℹ️ The caller will remain connected while our SIP trunk bridges the call to {transferDept}.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsTransferModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={transferring}
                  style={{ background: '#f59e0b', color: '#fff' }}
                >
                  {transferring ? 'Connecting SIP Bridge...' : 'Transfer Call Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
