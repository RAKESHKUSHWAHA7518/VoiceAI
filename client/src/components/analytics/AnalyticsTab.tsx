// ============================================================================
// Call Analytics & Post-Call Intelligence Tab Component
// Master-Detail Architecture: Call History Table -> Detailed Conversation & Recording
// Fully Vectorized: Enterprise SVG Logos & Icons (Zero Emojis)
// ============================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { CallAnalyticsRecord, Agent } from '../../types';
import {
  IconPhone,
  IconPhoneIncoming,
  IconStar,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconMic,
  IconAudioWave,
  IconSearch,
  IconClose,
  IconTrash,
  IconArrowLeft,
  IconArrowRight,
  IconDownload,
  IconSquare,
  IconVolume,
  IconMessageSquare,
  IconCopy,
  IconUser,
  IconRefresh,
  IconSparkles,
  IconShieldCheck,
  IconHeart,
  IconMessageCircle,
  IconTarget,
  IconZap,
  IconFileText,
  IconSmile,
  IconTag,
  IconListCheck,
  IconLightbulb,
  PersonaAvatar,
} from '../common/Icons';

interface AnalyticsTabProps {
  agents: Agent[];
  onStartVoiceCall?: (agent: Agent) => void;
}

export function AnalyticsTab({ agents, onStartVoiceCall }: AnalyticsTabProps) {
  const [calls, setCalls] = useState<CallAnalyticsRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [resolutionFilter, setResolutionFilter] = useState<string>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [audioOnlyFilter, setAudioOnlyFilter] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'recent' | 'score' | 'duration' | 'score_asc'>('recent');

  // Detail View State
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [activeSpeechTurnIndex, setActiveSpeechTurnIndex] = useState<number | null>(null);
  const [transcriptSearch, setTranscriptSearch] = useState<string>('');
  const [copiedTranscript, setCopiedTranscript] = useState<boolean>(false);
  const [actionItemChecks, setActionItemChecks] = useState<Record<string, boolean>>({});

  const isSpeakingRef = useRef<boolean>(false);

  const fetchCalls = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/calls');
      const data = await res.json();
      if (data.calls && Array.isArray(data.calls)) {
        setCalls(data.calls);
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

  // Cleanup speech synthesis on unmount or call switch
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      isSpeakingRef.current = false;
    };
  }, [selectedCallId]);

  const handleDeleteCall = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this call record and its recording?')) return;
    try {
      await fetch(`/api/calls/${id}`, { method: 'DELETE' });
      const remaining = calls.filter(c => c.id !== id);
      setCalls(remaining);
      if (selectedCallId === id) {
        setSelectedCallId(null);
      }
    } catch (err) {
      console.error('Failed to delete call:', err);
    }
  };

  // Filtered & Sorted Call History List
  const filteredCalls = useMemo(() => {
    return calls
      .filter(call => {
        if (agentFilter !== 'all' && call.agent_name !== agentFilter && call.agent_id !== agentFilter) return false;
        if (resolutionFilter !== 'all' && call.resolution_status !== resolutionFilter) return false;
        if (sentimentFilter !== 'all' && call.sentiment !== sentimentFilter) return false;
        if (audioOnlyFilter && !call.audio_url) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesSummary = call.summary?.toLowerCase().includes(q);
          const matchesAgent = call.agent_name?.toLowerCase().includes(q);
          const matchesRole = call.agent_role?.toLowerCase().includes(q);
          const matchesId = call.id?.toLowerCase().includes(q) || call.session_id?.toLowerCase().includes(q);
          const matchesTopics = (call.topics || []).some(t => t.toLowerCase().includes(q));
          const matchesTranscripts = (call.transcripts || []).some(t => t.text.toLowerCase().includes(q));
          if (!matchesSummary && !matchesAgent && !matchesRole && !matchesId && !matchesTopics && !matchesTranscripts) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score') return (b.qa_scores?.overall_score || 0) - (a.qa_scores?.overall_score || 0);
        if (sortBy === 'score_asc') return (a.qa_scores?.overall_score || 0) - (b.qa_scores?.overall_score || 0);
        if (sortBy === 'duration') return b.duration_seconds - a.duration_seconds;
        return b.timestamp - a.timestamp;
      });
  }, [calls, agentFilter, resolutionFilter, sentimentFilter, audioOnlyFilter, searchQuery, sortBy]);

  // Selected Call object for Detail View
  const selectedCall = useMemo(() => {
    if (!selectedCallId) return null;
    return calls.find(c => c.id === selectedCallId) || null;
  }, [calls, selectedCallId]);

  // Executive KPI summary calculations
  const totalCalls = calls.length;
  const avgQAScore = totalCalls > 0 
    ? Math.round(calls.reduce((acc, c) => acc + (c.qa_scores?.overall_score || 90), 0) / totalCalls) 
    : 0;
  const resolvedCount = calls.filter(c => c.resolution_status === 'Resolved').length;
  const resolutionRate = totalCalls > 0 ? Math.round((resolvedCount / totalCalls) * 100) : 100;
  const avgDuration = totalCalls > 0 
    ? Math.round(calls.reduce((acc, c) => acc + c.duration_seconds, 0) / totalCalls) 
    : 0;
  const callsWithAudioCount = calls.filter(c => !!c.audio_url).length;

  // Formatting helpers
  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return {
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const formatRelativeTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDays = Math.floor(diffHour / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'Positive': return 'var(--studio-success)';
      case 'Neutral': return 'var(--studio-accent)';
      case 'Curious': return 'var(--studio-chart)';
      case 'Frustrated': return 'var(--studio-danger)';
      default: return 'var(--studio-secondary)';
    }
  };

  const getQAColor = (score: number) => {
    if (score >= 90) return 'var(--studio-success)';
    if (score >= 80) return 'var(--studio-accent)';
    if (score >= 70) return 'var(--studio-warning)';
    return 'var(--studio-danger)';
  };

  const getQAGrade = (score: number) => {
    if (score >= 95) return 'A+ • Exceptional';
    if (score >= 90) return 'A • Excellent';
    if (score >= 80) return 'B • High Quality';
    if (score >= 70) return 'C • Standard';
    return 'D • Needs Review';
  };

  const getResolutionBadgeClass = (status: string) => {
    switch (status) {
      case 'Resolved': return 'badge-resolved';
      case 'Needs Follow-Up': return 'badge-followup';
      case 'Escalated': return 'badge-escalated';
      default: return 'badge-unresolved';
    }
  };

  // Speech replay functions
  const playFullTranscriptSpeech = (call: CallAnalyticsRecord) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (isPlayingAudio) {
      setIsPlayingAudio(false);
      setActiveSpeechTurnIndex(null);
      isSpeakingRef.current = false;
      return;
    }

    setIsPlayingAudio(true);
    isSpeakingRef.current = true;
    const turns = call.transcripts || [];
    let turnIdx = 0;

    const speakNextTurn = () => {
      if (!isSpeakingRef.current || turnIdx >= turns.length) {
        setIsPlayingAudio(false);
        setActiveSpeechTurnIndex(null);
        isSpeakingRef.current = false;
        return;
      }
      setActiveSpeechTurnIndex(turnIdx);
      const turn = turns[turnIdx];
      const utterance = new SpeechSynthesisUtterance(turn.text);
      utterance.rate = 1.0;
      utterance.pitch = turn.role === 'user' ? 0.95 : 1.1;
      utterance.onend = () => {
        if (!isSpeakingRef.current) return;
        turnIdx++;
        setTimeout(speakNextTurn, 400);
      };
      utterance.onerror = () => {
        setIsPlayingAudio(false);
        setActiveSpeechTurnIndex(null);
        isSpeakingRef.current = false;
      };
      window.speechSynthesis.speak(utterance);
    };

    speakNextTurn();
  };

  const stopSpeechPlayback = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setActiveSpeechTurnIndex(null);
    isSpeakingRef.current = false;
  };

  const playSingleTurnSpeech = (text: string, role: string, index: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setActiveSpeechTurnIndex(index);
    setIsPlayingAudio(true);
    isSpeakingRef.current = true;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = role === 'user' ? 0.95 : 1.1;
    utterance.onend = () => {
      setActiveSpeechTurnIndex(null);
      setIsPlayingAudio(false);
      isSpeakingRef.current = false;
    };
    utterance.onerror = () => {
      setActiveSpeechTurnIndex(null);
      setIsPlayingAudio(false);
      isSpeakingRef.current = false;
    };
    window.speechSynthesis.speak(utterance);
  };

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

  const copyTranscriptToClipboard = (call: CallAnalyticsRecord) => {
    const transcriptText = (call.transcripts || [])
      .map(t => `[${t.role === 'user' ? 'Caller' : call.agent_name}]: ${t.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(transcriptText);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const toggleActionItem = (key: string) => {
    setActionItemChecks(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setAgentFilter('all');
    setResolutionFilter('all');
    setSentimentFilter('all');
    setAudioOnlyFilter(false);
    setSortBy('recent');
  };

  const isFiltersActive = searchQuery !== '' || agentFilter !== 'all' || resolutionFilter !== 'all' || sentimentFilter !== 'all' || audioOnlyFilter;

  // ==========================================================================
  // VIEW 2: DEDICATED CALL DETAILS & RECORDING VIEW
  // Activated only when user clicks a specific call row
  // ==========================================================================
  if (selectedCallId && selectedCall) {
    const timeInfo = formatDate(selectedCall.timestamp);
    const overallScore = selectedCall.qa_scores?.overall_score || 90;
    const gradeText = getQAGrade(overallScore);
    const transcriptsList = selectedCall.transcripts || [];

    const filteredTranscripts = transcriptsList.filter(t => {
      if (!transcriptSearch.trim()) return true;
      return t.text.toLowerCase().includes(transcriptSearch.toLowerCase());
    });

    return (
      <div className="analytics-page call-detail-page">
        {/* Top Navigation & Breadcrumb Bar */}
        <div className="call-detail-top-nav">
          <div className="top-nav-left">
            <button 
              className="btn btn-back-call" 
              onClick={() => {
                stopSpeechPlayback();
                setSelectedCallId(null);
              }}
              title="Return to full Call History list"
            >
              <IconArrowLeft size={16} />
              <span className="back-label">Back to Call History</span>
            </button>
            <div className="call-breadcrumb-trail">
              <span className="crumb-root" onClick={() => { stopSpeechPlayback(); setSelectedCallId(null); }}>
                Call History
              </span>
              <span className="crumb-sep">/</span>
              <span className="crumb-current" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                <PersonaAvatar name={selectedCall.agent_name} role={selectedCall.agent_role} size={22} />
                {selectedCall.agent_name} ({selectedCall.id})
              </span>
            </div>
          </div>

          <div className="top-nav-actions">
            <button className="btn btn-outline btn-sm" onClick={() => exportReport(selectedCall)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <IconDownload size={14} />
              <span>Export JSON</span>
            </button>
            {selectedCall.audio_url && (
              <a 
                href={selectedCall.audio_url} 
                download={`${selectedCall.id}.webm`} 
                className="btn btn-outline btn-sm"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <IconMic size={14} />
                <span>Download Audio</span>
              </a>
            )}
            {onStartVoiceCall && (
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const target = agents.find(a => a.id === selectedCall.agent_id || a.name === selectedCall.agent_name);
                  if (target) onStartVoiceCall(target);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <IconPhone size={14} />
                <span>Call Again</span>
              </button>
            )}
            <button 
              className="btn btn-danger-outline btn-sm" 
              onClick={() => handleDeleteCall(selectedCall.id)}
              title="Delete this call record"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <IconTrash size={14} />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {/* Hero Call Metadata Header Card */}
        <div className="call-detail-hero-card">
          <div className="hero-agent-col">
            <PersonaAvatar name={selectedCall.agent_name} role={selectedCall.agent_role} size={54} />
            <div className="hero-agent-meta">
              <div className="hero-agent-name-row">
                <h2>{selectedCall.agent_name}</h2>
                <span className="hero-role-pill">{selectedCall.agent_role}</span>
              </div>
              <div className="hero-session-meta">
                <span>Session: <code>{selectedCall.session_id}</code></span>
                <span>•</span>
                <span>{timeInfo.date} at {timeInfo.time}</span>
                <span>•</span>
                <span>{formatRelativeTime(selectedCall.timestamp)}</span>
              </div>
            </div>
          </div>

          <div className="hero-stats-row">
            <div className="hero-stat-box">
              <span className="stat-label">Duration</span>
              <span className="stat-val" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <IconClock size={13} color="var(--studio-secondary)" />
                {formatDuration(selectedCall.duration_seconds)}
              </span>
            </div>
            <div className="hero-stat-box">
              <span className="stat-label">QA Compliance</span>
              <span className="stat-val" style={{ color: getQAColor(overallScore), display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <IconStar size={13} color={getQAColor(overallScore)} />
                {overallScore}%
              </span>
            </div>
            <div className="hero-stat-box">
              <span className="stat-label">Sentiment</span>
              <span className="stat-val" style={{ color: getSentimentColor(selectedCall.sentiment) }}>
                ● {selectedCall.sentiment} ({selectedCall.sentiment_score}%)
              </span>
            </div>
            <div className="hero-stat-box">
              <span className="stat-label">Resolution</span>
              <span className={`status-pill ${getResolutionBadgeClass(selectedCall.resolution_status)}`}>
                {selectedCall.resolution_status}
              </span>
            </div>
          </div>
        </div>

        {/* Hero Audio Recording Card */}
        <div className="call-recording-hero-card">
          <div className="recording-card-header">
            <div className="recording-title-wrap">
              <span className="rec-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <IconAudioWave size={26} color="var(--studio-accent)" />
              </span>
              <div>
                <h3 className="rec-heading">Call Audio Recording & Playback</h3>
                <span className="rec-sub">
                  {selectedCall.audio_url 
                    ? 'High-Definition Audio Recording (48kHz Opus WebM) logged during the conversation' 
                    : 'Audio recording file was not saved for this call. Use speech synthesized dialogue replay below.'}
                </span>
              </div>
            </div>
            {selectedCall.audio_url ? (
              <span className="rec-badge-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <IconMic size={13} />
                <span>HD Audio Recording</span>
              </span>
            ) : (
              <span className="rec-badge-simulated">Synthesized Replay Mode</span>
            )}
          </div>

          <div className="recording-player-body">
            {selectedCall.audio_url ? (
              <div className="audio-player-container">
                <audio 
                  controls 
                  src={selectedCall.audio_url} 
                  className="modern-audio-element" 
                  preload="metadata"
                />
                <div className="audio-details-footnote">
                  <span>Audio source: <code>{selectedCall.audio_url}</code></span>
                  <span>Duration: {formatDuration(selectedCall.duration_seconds)}</span>
                </div>
              </div>
            ) : (
              <div className="speech-synth-player-bar">
                <button 
                  className={`btn ${isPlayingAudio ? 'btn-danger' : 'btn-success'} btn-md`}
                  onClick={() => playFullTranscriptSpeech(selectedCall)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  {isPlayingAudio ? (
                    <>
                      <IconSquare size={14} />
                      <span>Stop Dialogue Playback</span>
                    </>
                  ) : (
                    <>
                      <IconVolume size={15} />
                      <span>Play Dialogue (Speech Synth)</span>
                    </>
                  )}
                </button>
                <div className="synth-status-text">
                  {isPlayingAudio ? (
                    <span className="active-speaking-indicator" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <IconMic size={14} color="var(--studio-accent)" />
                      Speaking turn {activeSpeechTurnIndex !== null ? `#${activeSpeechTurnIndex + 1}` : ''}...
                    </span>
                  ) : (
                    <span>Listen to the dialogue spoken aloud turn-by-turn with distinct user/agent pitch modulation.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main 2-Column Split: Detailed Conversation Transcript (Left) + Intelligence Scorecard (Right) */}
        <div className="call-detail-two-col-grid">
          {/* Left Column: Full Conversation Transcript */}
          <div className="call-detail-transcript-col">
            <div className="detail-section-card transcript-card-container">
              <div className="card-section-header">
                <div className="section-title-wrap">
                  <span className="section-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <IconMessageSquare size={18} color="var(--studio-accent)" />
                  </span>
                  <div>
                    <h3 className="section-title">Conversation Transcript</h3>
                    <span className="section-count">{transcriptsList.length} total dialogue turns</span>
                  </div>
                </div>

                <div className="transcript-header-actions">
                  <button 
                    className="btn btn-outline btn-sm copy-btn"
                    onClick={() => copyTranscriptToClipboard(selectedCall)}
                    title="Copy transcript to clipboard"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    {copiedTranscript ? (
                      <>
                        <IconCheck size={13} color="var(--studio-success)" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <IconCopy size={13} />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Transcript Search */}
              <div className="transcript-search-bar">
                <input
                  type="text"
                  className="form-input form-input-sm"
                  placeholder="Filter dialogue keywords (e.g. price, booking, thank you)..."
                  value={transcriptSearch}
                  onChange={e => setTranscriptSearch(e.target.value)}
                />
                {transcriptSearch && (
                  <button className="clear-search-btn" onClick={() => setTranscriptSearch('')}>
                    <IconClose size={13} />
                  </button>
                )}
              </div>

              {/* Transcript Speech Bubbles Stream */}
              <div className="conversation-bubbles-stream">
                {filteredTranscripts.length === 0 ? (
                  <div className="empty-transcript-hint">
                    {transcriptSearch ? 'No dialogue turns match your keyword filter.' : 'No dialogue recorded for this session.'}
                  </div>
                ) : (
                  filteredTranscripts.map((turn, idx) => {
                    const isUser = turn.role === 'user';
                    const isSpeakingThis = isPlayingAudio && activeSpeechTurnIndex === idx;

                    return (
                      <div 
                        key={idx} 
                        className={`dialogue-turn-row ${isUser ? 'turn-user' : 'turn-agent'} ${isSpeakingThis ? 'turn-currently-speaking' : ''}`}
                      >
                        <div className="turn-avatar-badge" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isUser ? (
                            <IconUser size={18} color="var(--studio-secondary)" />
                          ) : (
                            <PersonaAvatar name={selectedCall.agent_name} role={selectedCall.agent_role} size={32} />
                          )}
                        </div>

                        <div className="turn-bubble-wrapper">
                          <div className="turn-speaker-meta">
                            <span className="turn-speaker-name">
                              {isUser ? 'Caller (You)' : selectedCall.agent_name}
                            </span>
                            {!isUser && <span className="turn-speaker-role">{selectedCall.agent_role}</span>}
                            <button 
                              className="turn-speak-mini-btn"
                              title="Listen to this line"
                              onClick={() => playSingleTurnSpeech(turn.text, turn.role, idx)}
                              style={{ display: 'inline-flex', alignItems: 'center' }}
                            >
                              <IconVolume size={13} />
                            </button>
                          </div>

                          <div className="turn-bubble-body">
                            {turn.text}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Column: QA Intelligence & Audit Scorecard */}
          <div className="call-detail-scorecard-col">
            {/* QA Scorecard Radial & Bar Breakdown */}
            <div className="detail-section-card qa-audit-card">
              <div className="card-section-header">
                <div className="section-title-wrap">
                  <span className="section-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <IconShieldCheck size={20} color="var(--studio-success)" />
                  </span>
                  <div>
                    <h3 className="section-title">QA Compliance & Audit Scorecard</h3>
                    <span className="section-count">{gradeText}</span>
                  </div>
                </div>
              </div>

              <div className="qa-hero-score-banner">
                <div className="qa-big-circle" style={{ borderColor: getQAColor(overallScore) }}>
                  <span className="qa-big-num" style={{ color: getQAColor(overallScore) }}>{overallScore}%</span>
                  <span className="qa-circle-sub">Overall QA</span>
                </div>
                <div className="qa-summary-text-block">
                  <div className="qa-grade-badge" style={{ background: `${getQAColor(overallScore)}20`, color: getQAColor(overallScore) }}>
                    {gradeText}
                  </div>
                  <p className="qa-summary-p">
                    Evaluated across conversational tone, response clarity, tool correctness, and turn latency.
                  </p>
                </div>
              </div>

              {/* Breakdown Metric Progress Bars */}
              <div className="qa-bars-list">
                <div className="qa-bar-item">
                  <div className="qa-bar-row">
                    <span className="qa-metric-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <IconHeart size={14} color="var(--studio-accent)" />
                      <span>Empathy & Tone</span>
                    </span>
                    <span className="qa-metric-val">{selectedCall.qa_scores?.empathy || 90}%</span>
                  </div>
                  <div className="qa-progress-bg">
                    <div className="qa-progress-fill" style={{ width: `${selectedCall.qa_scores?.empathy || 90}%`, background: 'var(--studio-accent)' }} />
                  </div>
                </div>

                <div className="qa-bar-item">
                  <div className="qa-bar-row">
                    <span className="qa-metric-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <IconMessageCircle size={14} color="var(--studio-success)" />
                      <span>Response Clarity & Conciseness</span>
                    </span>
                    <span className="qa-metric-val">{selectedCall.qa_scores?.clarity || 94}%</span>
                  </div>
                  <div className="qa-progress-bg">
                    <div className="qa-progress-fill" style={{ width: `${selectedCall.qa_scores?.clarity || 94}%`, background: 'var(--studio-success)' }} />
                  </div>
                </div>

                <div className="qa-bar-item">
                  <div className="qa-bar-row">
                    <span className="qa-metric-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <IconTarget size={14} color="var(--studio-chart)" />
                      <span>Tool & Function Accuracy</span>
                    </span>
                    <span className="qa-metric-val">{selectedCall.qa_scores?.tool_accuracy || 98}%</span>
                  </div>
                  <div className="qa-progress-bg">
                    <div className="qa-progress-fill" style={{ width: `${selectedCall.qa_scores?.tool_accuracy || 98}%`, background: 'var(--studio-chart)' }} />
                  </div>
                </div>

                <div className="qa-bar-item">
                  <div className="qa-bar-row">
                    <span className="qa-metric-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <IconZap size={14} color="var(--studio-warning)" />
                      <span>Response Speed & Fluency</span>
                    </span>
                    <span className="qa-metric-val">{selectedCall.qa_scores?.response_speed || 92}%</span>
                  </div>
                  <div className="qa-progress-bg">
                    <div className="qa-progress-fill" style={{ width: `${selectedCall.qa_scores?.response_speed || 92}%`, background: 'var(--studio-warning)' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Executive Call Summary */}
            <div className="detail-section-card">
              <div className="card-section-header">
                <div className="section-title-wrap">
                  <span className="section-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <IconFileText size={18} color="var(--studio-accent)" />
                  </span>
                  <h3 className="section-title">Executive Summary</h3>
                </div>
              </div>
              <p className="executive-summary-text">
                {selectedCall.summary || 'Summary generated automatically from call dialogue.'}
              </p>
            </div>

            {/* Sentiment & Resolution Matrix */}
            <div className="detail-section-card">
              <div className="card-section-header">
                <div className="section-title-wrap">
                  <span className="section-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <IconSmile size={18} color="var(--studio-warning)" />
                  </span>
                  <h3 className="section-title">Sentiment & Resolution Analysis</h3>
                </div>
              </div>
              <div className="sentiment-status-grid">
                <div className="sentiment-stat-card">
                  <span className="label">Caller Sentiment</span>
                  <div className="val-row">
                    <span className="sentiment-pill-lg" style={{ color: getSentimentColor(selectedCall.sentiment), borderColor: getSentimentColor(selectedCall.sentiment) }}>
                      ● {selectedCall.sentiment}
                    </span>
                    <span className="score-pct">{selectedCall.sentiment_score}% confidence</span>
                  </div>
                </div>

                <div className="sentiment-stat-card">
                  <span className="label">Resolution Status</span>
                  <div className="val-row">
                    <span className={`status-pill status-pill-lg ${getResolutionBadgeClass(selectedCall.resolution_status)}`}>
                      {selectedCall.resolution_status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Topics Discussed */}
            {selectedCall.topics && selectedCall.topics.length > 0 && (
              <div className="detail-section-card">
                <div className="card-section-header">
                  <div className="section-title-wrap">
                    <span className="section-icon" style={{ display: 'flex', alignItems: 'center' }}>
                      <IconTag size={17} color="var(--studio-accent)" />
                    </span>
                    <h3 className="section-title">Key Topics Discussed</h3>
                  </div>
                </div>
                <div className="topics-pill-cloud">
                  {selectedCall.topics.map((t, idx) => (
                    <span key={idx} className="topic-chip">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Extracted Action Items & Follow-up Checklist */}
            {selectedCall.action_items && selectedCall.action_items.length > 0 && (
              <div className="detail-section-card">
                <div className="card-section-header">
                  <div className="section-title-wrap">
                    <span className="section-icon" style={{ display: 'flex', alignItems: 'center' }}>
                      <IconListCheck size={18} color="var(--studio-success)" />
                    </span>
                    <h3 className="section-title">Follow-up Action Items</h3>
                  </div>
                </div>
                <div className="action-items-checklist">
                  {selectedCall.action_items.map((item, idx) => {
                    const key = `${selectedCall.id}_action_${idx}`;
                    const isChecked = !!actionItemChecks[key];
                    return (
                      <div 
                        key={idx} 
                        className={`action-item-check-row ${isChecked ? 'action-item-done' : ''}`}
                        onClick={() => toggleActionItem(key)}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => {}} 
                          className="action-checkbox"
                        />
                        <span className="action-text">{item}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VIEW 1: MASTER CALL HISTORY PAGE (ONLY CALL HISTORY)
  // Dedicated, full-width, clean table view with search & filters
  // ==========================================================================
  return (
    <div className="analytics-page">
      {/* Page Header */}
      <div className="analytics-header-banner">
        <div className="header-text-block">
          <div className="header-badge-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <IconSparkles size={13} color="var(--studio-accent)" />
            <span>Voice AI Intelligence</span>
          </div>
          <h1 className="header-title">Call History & Post-Call QA</h1>
          <p className="header-subtitle">
            Review logged customer conversations, automated QA compliance scorecards, and high-definition call recordings.
          </p>
        </div>

        <div className="header-actions">
          <button className="btn btn-outline" onClick={fetchCalls} title="Reload call records from server" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <IconRefresh size={14} />
            <span>Refresh Records</span>
          </button>
        </div>
      </div>

      {/* Top Executive KPI Cards */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(var(--studio-accent-rgb), 0.12)', color: 'var(--studio-accent)' }}>
            <IconPhone size={22} color="var(--studio-accent)" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Total Calls Logged</span>
            <span className="kpi-value">{totalCalls}</span>
            <span className="kpi-subtext">Across all configured agents</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(var(--studio-success-rgb), 0.12)', color: 'var(--studio-success)' }}>
            <IconStar size={22} color="var(--studio-success)" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Average QA Score</span>
            <span className="kpi-value" style={{ color: getQAColor(avgQAScore) }}>
              {avgQAScore}%
            </span>
            <span className="kpi-subtext">{getQAGrade(avgQAScore)}</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(var(--studio-chart-rgb), 0.12)', color: 'var(--studio-chart)' }}>
            <IconCheckCircle size={22} color="var(--studio-chart)" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">First-Call Resolution</span>
            <span className="kpi-value" style={{ color: 'var(--studio-chart)' }}>{resolutionRate}%</span>
            <span className="kpi-subtext">{resolvedCount} of {totalCalls} calls resolved</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(var(--studio-warning-rgb), 0.12)', color: 'var(--studio-warning)' }}>
            <IconClock size={22} color="var(--studio-warning)" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Avg Handle Time</span>
            <span className="kpi-value">{formatDuration(avgDuration)}</span>
            <span className="kpi-subtext">Duration per interaction</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(var(--studio-danger-rgb), 0.12)', color: 'var(--studio-danger)' }}>
            <IconAudioWave size={22} color="var(--studio-danger)" />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Recorded Calls</span>
            <span className="kpi-value">{callsWithAudioCount}</span>
            <span className="kpi-subtext">HD audio available for playback</span>
          </div>
        </div>
      </div>

      {/* Modern Filter & Search Toolbar */}
      <div className="analytics-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">
            <IconSearch size={16} />
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Search calls by summary, agent, topic, or dialogue..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')} title="Clear search">
              <IconClose size={13} />
            </button>
          )}
        </div>

        <div className="toolbar-filters-row">
          <div className="filter-select-item">
            <label>Agent:</label>
            <select 
              className="form-select form-select-sm" 
              value={agentFilter} 
              onChange={e => setAgentFilter(e.target.value)}
            >
              <option value="all">All Agents ({agents.length})</option>
              {agents.map(a => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-select-item">
            <label>Resolution:</label>
            <select 
              className="form-select form-select-sm" 
              value={resolutionFilter} 
              onChange={e => setResolutionFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="Resolved">Resolved</option>
              <option value="Needs Follow-Up">Needs Follow-Up</option>
              <option value="Escalated">Escalated</option>
              <option value="Unresolved">Unresolved</option>
            </select>
          </div>

          <div className="filter-select-item">
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

          <div className="filter-select-item">
            <label>Sort By:</label>
            <select 
              className="form-select form-select-sm" 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value as any)}
            >
              <option value="recent">Most Recent</option>
              <option value="score">Highest QA Score</option>
              <option value="score_asc">Lowest QA Score</option>
              <option value="duration">Longest Call</option>
            </select>
          </div>

          <label className="audio-toggle-filter" title="Show only calls with recorded audio">
            <input 
              type="checkbox" 
              checked={audioOnlyFilter} 
              onChange={e => setAudioOnlyFilter(e.target.checked)} 
            />
            <IconMic size={13} color="var(--studio-success)" />
            <span>HD Audio Only</span>
          </label>

          {isFiltersActive && (
            <button className="btn btn-outline btn-sm reset-filter-btn" onClick={resetAllFilters}>
              Clear Filters
            </button>
          )}

          <div className="filter-counter">
            Showing <strong>{filteredCalls.length}</strong> of {totalCalls}
          </div>
        </div>
      </div>

      {/* Master Call History Data Table */}
      <div className="call-history-table-container">
        {loading ? (
          <div className="table-loading-state">
            <div className="loading-spinner" />
            <p>Loading call history records...</p>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="analytics-empty-state">
            <div className="empty-icon" style={{ display: 'flex', justifyContent: 'center' }}>
              <IconPhoneIncoming size={48} color="var(--studio-muted)" />
            </div>
            <h3>No Call Records Found</h3>
            <p>
              {isFiltersActive 
                ? 'No calls match the filters or search terms you entered.' 
                : 'No voice conversations have been recorded yet. Start a call in Playground or Agents Studio to generate call logs!'}
            </p>
            {isFiltersActive ? (
              <button className="btn btn-outline" onClick={resetAllFilters}>
                Reset All Filters
              </button>
            ) : onStartVoiceCall && agents.length > 0 ? (
              <button className="btn btn-primary" onClick={() => onStartVoiceCall(agents[0])} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <IconPhone size={14} />
                <span>Start First Voice Call</span>
              </button>
            ) : null}
          </div>
        ) : (
          <table className="call-history-table">
            <thead>
              <tr>
                <th style={{ width: '24%' }}>Agent & Role</th>
                <th style={{ width: '16%' }}>Date & Time</th>
                <th style={{ width: '11%' }}>Duration</th>
                <th style={{ width: '12%' }}>Sentiment</th>
                <th style={{ width: '13%' }}>Resolution</th>
                <th style={{ width: '10%' }}>QA Score</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.map(c => {
                const timeInfo = formatDate(c.timestamp);
                const score = c.qa_scores?.overall_score || 90;

                return (
                  <tr 
                    key={c.id} 
                    className="call-history-row"
                    onClick={() => setSelectedCallId(c.id)}
                    title="Click row to inspect full conversation transcript and audio recording"
                  >
                    {/* Agent & Persona Cell */}
                    <td>
                      <div className="table-agent-cell">
                        <PersonaAvatar name={c.agent_name} role={c.agent_role} size={38} />
                        <div className="agent-name-meta">
                          <span className="agent-primary-name">{c.agent_name}</span>
                          <span className="agent-secondary-role">{c.agent_role}</span>
                        </div>
                      </div>
                    </td>

                    {/* Date & Time Cell */}
                    <td>
                      <div className="table-time-cell">
                        <span className="time-primary">{timeInfo.date}</span>
                        <span className="time-secondary">{timeInfo.time} ({formatRelativeTime(c.timestamp)})</span>
                      </div>
                    </td>

                    {/* Duration Cell */}
                    <td>
                      <div className="table-duration-cell">
                        <span className="duration-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <IconClock size={11} color="var(--studio-secondary)" />
                          <span>{formatDuration(c.duration_seconds)}</span>
                        </span>
                      </div>
                    </td>

                    {/* Sentiment Cell */}
                    <td>
                      <span 
                        className="sentiment-pill"
                        style={{ color: getSentimentColor(c.sentiment), borderColor: getSentimentColor(c.sentiment) }}
                      >
                        ● {c.sentiment}
                      </span>
                    </td>

                    {/* Resolution Status Cell */}
                    <td>
                      <span className={`status-pill ${getResolutionBadgeClass(c.resolution_status)}`}>
                        {c.resolution_status}
                      </span>
                    </td>

                    {/* QA Score Cell */}
                    <td>
                      <div className="table-qa-cell">
                        <span className="qa-score-badge" style={{ color: getQAColor(score), borderColor: getQAColor(score), display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <IconStar size={12} color={getQAColor(score)} />
                          <span>{score}%</span>
                        </span>
                      </div>
                    </td>

                    {/* Actions Cell */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="table-actions-cell" onClick={e => e.stopPropagation()}>
                        {c.audio_url && (
                          <span className="table-audio-indicator" title="Audio recording available" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <IconAudioWave size={11} color="var(--studio-success)" />
                            <span>Audio</span>
                          </span>
                        )}
                        <button 
                          className="btn-view-details"
                          onClick={() => setSelectedCallId(c.id)}
                          title="Open full conversation and recording"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <span>View Details</span>
                          <IconArrowRight size={12} />
                        </button>
                        <button 
                          className="btn-delete-row"
                          onClick={(e) => handleDeleteCall(c.id, e)}
                          title="Delete call record"
                          style={{ display: 'inline-flex', alignItems: 'center' }}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick Helper Banner */}
      <div className="call-history-footer-hint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
        <IconLightbulb size={15} color="var(--studio-warning)" />
        <span><strong>Tip:</strong> Click anywhere on a call row to open its conversation transcript dialogue bubbles and audio player.</span>
      </div>
    </div>
  );
}
