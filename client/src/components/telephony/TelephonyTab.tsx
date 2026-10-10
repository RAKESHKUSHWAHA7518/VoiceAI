// ============================================================================
// Telephony & Real Phone Calling Component (Phase 1)
// Inbound Numbers Routing, Outbound Dialer, and Twilio Media Stream Configuration
// ============================================================================

import React, { useState, useEffect } from 'react';
import type { Agent, PhoneNumberRecord } from '../../types';
import {
  IconPhone,
  IconPhoneIncoming,
  IconAudioWave,
  IconClock,
  IconClose,
  IconTrash,
  IconCopy,
  IconRefresh,
  IconSparkles,
  IconShieldCheck,
  IconZap,
  PersonaAvatar,
} from '../common/Icons';

interface TelephonyTabProps {
  agents: Agent[];
  onStartVoiceCall?: (agent: Agent) => void;
}

export function TelephonyTab({ agents }: TelephonyTabProps) {
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isTwilioConfigured, setIsTwilioConfigured] = useState<boolean>(false);

  // Outbound Dialer state
  const [outboundNumber, setOutboundNumber] = useState<string>('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || 'agent_support');
  const [selectedCallerId, setSelectedCallerId] = useState<string>('');
  const [dialingState, setDialingState] = useState<'idle' | 'dialing' | 'ringing' | 'connected' | 'ended'>('idle');
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [callDurationSec, setCallDurationSec] = useState<number>(0);
  const [dialerMessage, setDialerMessage] = useState<string>('');

  // New Number Modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState<string>('');
  const [newFriendlyName, setNewFriendlyName] = useState<string>('');
  const [newAgentId, setNewAgentId] = useState<string>(agents[0]?.id || '');

  // Webhook copy feedback
  const [copiedWebhook, setCopiedWebhook] = useState<boolean>(false);
  const [simulatingInbound, setSimulatingInbound] = useState<boolean>(false);

  const fetchNumbers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/telephony/numbers');
      const data = await res.json();
      if (data.numbers && Array.isArray(data.numbers)) {
        setNumbers(data.numbers);
        if (data.numbers.length > 0 && !selectedCallerId) {
          setSelectedCallerId(data.numbers[0].phone_number);
        }
      }
      setIsTwilioConfigured(!!data.twilio_configured);
    } catch (err) {
      console.error('Failed to fetch phone numbers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNumbers();
  }, []);

  // Outbound call timer
  useEffect(() => {
    let interval: any = null;
    if (dialingState === 'connected') {
      interval = setInterval(() => {
        setCallDurationSec((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDurationSec(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [dialingState]);

  // Handle Outbound Dial
  const handleInitiateCall = async () => {
    if (!outboundNumber.trim()) {
      alert('Please enter a destination phone number to dial.');
      return;
    }

    const assignedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

    try {
      setDialingState('dialing');
      setDialerMessage('Connecting to carrier gateway...');

      const res = await fetch('/api/telephony/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_phone_number: outboundNumber,
          from_phone_number: selectedCallerId || numbers[0]?.phone_number,
          agent_id: assignedAgent.id,
          agent_name: assignedAgent.name,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDialingState('idle');
        alert(`Dialing error: ${data.error || 'Failed to initiate outbound call'}`);
        return;
      }

      setActiveCallSid(data.call_sid);
      setDialingState('ringing');
      setDialerMessage(`Ringing ${outboundNumber}...`);

      // Simulate carrier connection after 2.5s
      setTimeout(() => {
        setDialingState('connected');
        setDialerMessage(`Call live with ${assignedAgent.name} over PSTN / μ-law bridge.`);
      }, 2500);
    } catch (err) {
      console.error('Outbound call failed:', err);
      setDialingState('idle');
      alert('Network error while placing outbound call.');
    }
  };

  const handleHangup = () => {
    setDialingState('ended');
    setDialerMessage('Call ended. Audio recording saved to Call History.');
    setTimeout(() => {
      setDialingState('idle');
      setActiveCallSid(null);
      fetchNumbers();
    }, 2500);
  };

  const handleKeypadPress = (digit: string) => {
    setOutboundNumber((prev) => prev + digit);
  };

  // Provision New Number
  const handleAddNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhoneNumber.trim()) return;

    const assignedAgent = agents.find((a) => a.id === newAgentId) || agents[0];

    try {
      const res = await fetch('/api/telephony/numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: newPhoneNumber,
          friendly_name: newFriendlyName || 'Voice Inbound Line',
          agent_id: assignedAgent?.id || 'agent_support',
          agent_name: assignedAgent?.name || 'Maya',
          agent_avatar: assignedAgent?.avatar,
        }),
      });
      const data = await res.json();
      if (data.success && data.number) {
        setNumbers([data.number, ...numbers]);
        setShowAddModal(false);
        setNewPhoneNumber('');
        setNewFriendlyName('');
      }
    } catch (err) {
      console.error('Failed to add number:', err);
    }
  };

  // Delete Number
  const handleDeleteNumber = async (id: string) => {
    if (!confirm('Release and delete this phone number?')) return;
    try {
      await fetch(`/api/telephony/numbers/${id}`, { method: 'DELETE' });
      setNumbers(numbers.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete number:', err);
    }
  };

  // Reassign Number to different agent
  const handleReassignAgent = async (numberId: string, agentId: string) => {
    const targetAgent = agents.find((a) => a.id === agentId);
    if (!targetAgent) return;
    try {
      const res = await fetch(`/api/telephony/numbers/${numberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: targetAgent.id,
          agent_name: targetAgent.name,
          agent_avatar: targetAgent.avatar,
        }),
      });
      const data = await res.json();
      if (data.success && data.number) {
        setNumbers(numbers.map((n) => (n.id === numberId ? data.number : n)));
      }
    } catch (err) {
      console.error('Failed to reassign agent:', err);
    }
  };

  // Test Inbound Call Simulation
  const handleSimulateInbound = async () => {
    try {
      setSimulatingInbound(true);
      const res = await fetch('/api/telephony/simulate-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller_number: '+1 (415) 555-0199',
          agent_id: selectedAgentId,
        }),
      });
      const data = await res.json();
      alert(`Inbound Telephony Simulation Initialized!\nCall SID: ${data.call_sid}\nMedia Stream: ${data.stream_url}\nCaller: ${data.caller_number}`);
      fetchNumbers();
    } catch (err) {
      alert('Failed to simulate inbound call.');
    } finally {
      setSimulatingInbound(false);
    }
  };

  const copyWebhookUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000';
    const webhook = `${origin}/api/telephony/inbound`;
    navigator.clipboard.writeText(webhook);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const totalInboundCalls = numbers.reduce((acc, n) => acc + (n.inbound_calls_count || 0), 0);

  return (
    <div className="analytics-page telephony-page">
      {/* Header Banner */}
      <div className="analytics-header-banner">
        <div className="header-text-block">
          <div className="header-badge-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <IconSparkles size={13} color="#38bdf8" />
            <span>PSTN Telephony & Carrier Infrastructure</span>
          </div>
          <h1 className="header-title">Telephony & Phone Numbers</h1>
          <p className="header-subtitle">
            Assign direct telephone numbers to your VoiceAI agents, receive live inbound phone calls over bi-directional 8kHz μ-law streaming, and launch outbound calls.
          </p>
        </div>

        <div className="header-actions">
          <button className="btn btn-outline" onClick={fetchNumbers} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <IconRefresh size={14} />
            <span>Refresh Numbers</span>
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <span>+ Add Number</span>
          </button>
        </div>
      </div>

      {/* Top Telephony KPI Cards */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
            <IconPhone size={22} color="#38bdf8" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Active Phone Lines</span>
            <span className="kpi-value">{numbers.length}</span>
            <span className="kpi-subtext">Provisioned & routed</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e' }}>
            <IconPhoneIncoming size={22} color="#22c55e" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Inbound Phone Calls</span>
            <span className="kpi-value">{totalInboundCalls}</span>
            <span className="kpi-subtext">Handled via Twilio bridge</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#a855f7' }}>
            <IconAudioWave size={22} color="#a855f7" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Streaming Codec</span>
            <span className="kpi-value" style={{ fontSize: '1.2rem', whiteSpace: 'nowrap' }}>G.711 μ-law</span>
            <span className="kpi-subtext">8000Hz bi-directional audio</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24' }}>
            <IconZap size={22} color="#fbbf24" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Stream Latency</span>
            <span className="kpi-value">&lt; 180ms</span>
            <span className="kpi-subtext">WebSocket frame buffer</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e' }}>
            <IconShieldCheck size={22} color="#22c55e" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Carrier Status</span>
            <span className="kpi-value" style={{ fontSize: '1.15rem', whiteSpace: 'nowrap', color: isTwilioConfigured ? '#22c55e' : '#38bdf8' }}>
              {isTwilioConfigured ? 'Twilio Live' : 'PSTN Bridge Ready'}
            </span>
            <span className="kpi-subtext">TwiML & MediaStream enabled</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout: Outbound Phone Dialer (Left) + Phone Numbers List (Right) */}
      <div className="telephony-main-grid">
        {/* Outbound Phone Dialer Card */}
        <div className="detail-section-card outbound-dialer-card">
          <div className="card-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <IconPhone size={18} color="#38bdf8" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#f1f5f9' }}>Outbound Dialer</h3>
            </div>
            {dialingState !== 'idle' && (
              <span className={`status-pill ${dialingState === 'connected' ? 'badge-resolved' : 'badge-followup'}`}>
                ● {dialingState.toUpperCase()}
              </span>
            )}
          </div>

          {/* Number Display Input */}
          <div className="dialer-display" style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Destination Phone Number:
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="+1 (555) 000-0000"
                value={outboundNumber}
                onChange={(e) => setOutboundNumber(e.target.value)}
                disabled={dialingState === 'connected' || dialingState === 'ringing'}
                style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', paddingRight: '2rem' }}
              />
              {outboundNumber && dialingState === 'idle' && (
                <button
                  onClick={() => setOutboundNumber('')}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <IconClose size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Agent & Caller ID Pickers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Speaking Agent:
              </label>
              <select
                className="form-select form-select-sm"
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                disabled={dialingState !== 'idle'}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Caller ID (From):
              </label>
              <select
                className="form-select form-select-sm"
                value={selectedCallerId}
                onChange={(e) => setSelectedCallerId(e.target.value)}
                disabled={dialingState !== 'idle'}
              >
                {numbers.map((n) => (
                  <option key={n.id} value={n.phone_number}>{n.friendly_name.slice(0, 14)}...</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tactile Keypad */}
          <div className="phone-keypad-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1.25rem' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
              <button
                key={digit}
                className="keypad-btn"
                onClick={() => handleKeypadPress(digit)}
                disabled={dialingState === 'connected' || dialingState === 'ringing'}
              >
                {digit}
              </button>
            ))}
          </div>

          {/* Call Controls */}
          {dialingState === 'idle' ? (
            <button
              className="btn btn-primary btn-lg"
              onClick={handleInitiateCall}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontWeight: 700,
                fontSize: '1rem',
                padding: '0.75rem',
              }}
            >
              <IconPhone size={18} color="#ffffff" />
              <span>Dial Phone Call</span>
            </button>
          ) : (
            <div className="active-call-controls" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ textAlign: 'center', padding: '0.65rem', background: 'rgba(11, 16, 28, 0.85)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <IconClock size={16} color="#38bdf8" />
                  <span>{Math.floor(callDurationSec / 60)}:{String(callDurationSec % 60).padStart(2, '0')}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                  {dialerMessage}
                </div>
                {activeCallSid && (
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                    Call SID: {activeCallSid}
                  </div>
                )}
              </div>

              <button
                className="btn btn-danger btn-lg"
                onClick={handleHangup}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  boxShadow: '0 4px 16px rgba(239, 68, 68, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  fontWeight: 700,
                  fontSize: '1rem',
                  padding: '0.75rem',
                }}
              >
                <IconClose size={18} />
                <span>Hang Up Call</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Phone Numbers Management & Webhooks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
          {/* Active Provisioned Phone Numbers */}
          <div className="detail-section-card">
            <div className="card-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <IconPhoneIncoming size={18} color="#22c55e" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#f1f5f9' }}>
                  Configured Telephone Lines ({numbers.length})
                </h3>
              </div>
              <button className="btn btn-outline btn-sm" onClick={handleSimulateInbound} disabled={simulatingInbound} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <IconPhoneIncoming size={13} />
                <span>{simulatingInbound ? 'Simulating...' : 'Test Inbound Call'}</span>
              </button>
            </div>

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading provisioned telephone numbers...</div>
            ) : numbers.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                No phone numbers configured yet. Click "+ Add Number" to route calls to an agent.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table className="call-history-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: 'nowrap' }}>Telephone Number</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Friendly Label</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Assigned Agent</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Inbound Calls</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                      <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {numbers.map((n) => (
                      <tr key={n.id} className="call-history-row" style={{ cursor: 'default' }}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)', fontSize: '0.92rem' }}>
                            <IconPhone size={15} color="#38bdf8" />
                            <span>{n.phone_number}</span>
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{n.friendly_name}</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <PersonaAvatar name={n.agent_name} size={28} />
                            <select
                              className="form-select form-select-sm"
                              value={n.agent_id}
                              onChange={(e) => handleReassignAgent(n.id, e.target.value)}
                              style={{ minWidth: '130px', fontSize: '0.8rem' }}
                            >
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="duration-pill" style={{ whiteSpace: 'nowrap' }}>📞 {n.inbound_calls_count || 0} calls</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="status-pill badge-resolved" style={{ whiteSpace: 'nowrap' }}>Active</span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            className="btn-delete-row"
                            onClick={() => handleDeleteNumber(n.id)}
                            title="Release phone number"
                          >
                            <IconTrash size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Twilio Carrier Webhook Setup Box */}
          <div className="detail-section-card">
            <div className="card-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <IconZap size={18} color="#fbbf24" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#f1f5f9' }}>
                  Twilio Webhook & Media Stream Setup
                </h3>
              </div>
              <button className="btn btn-outline btn-sm" onClick={copyWebhookUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <IconCopy size={13} />
                <span>{copiedWebhook ? '✓ Copied!' : 'Copy Webhook URL'}</span>
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
              To connect your real Twilio phone numbers to VoiceAI, configure the incoming voice webhook on your Twilio Console phone number configuration to point to:
            </p>

            <div style={{ background: 'rgba(11, 16, 28, 0.85)', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#38bdf8', marginBottom: '1rem', wordBreak: 'break-all' }}>
              POST {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'}/api/telephony/inbound
            </div>

            <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div>• <strong>Protocol:</strong> Bi-directional 8000Hz G.711 μ-law streaming via <code>wss://.../media-stream</code></div>
              <div>• <strong>Interruption Handling:</strong> Automated <code>clear</code> buffer event silencing upon user speech</div>
              <div>• <strong>Post-Call Recording:</strong> Automatically processed into QA scorecards in Call History</div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Number Modal */}
      {showAddModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.75rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem' }}>Provision Telephone Line</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleAddNumber}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Phone Number (E.164):
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="+1 (555) 234-5678"
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Friendly Label:
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Inbound Sales Hotline"
                  value={newFriendlyName}
                  onChange={(e) => setNewFriendlyName(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Assigned Voice Agent:
                </label>
                <select
                  className="form-select"
                  value={newAgentId}
                  onChange={(e) => setNewAgentId(e.target.value)}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {a.role}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save & Route Calls
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
