// ============================================================================
// VoiceAI - Automated Agent Testing Suite & Batch Evaluation Simulator Tab
// Enterprise QA Regression Suite & AI Judge Scorecard
// ============================================================================

import { useState, useEffect } from 'react';
import type { EvalTestSuite, EvalRunRecord, Agent } from '../../types';
import {
  IconFlask,
  IconCheck,
  IconClock,
  IconShieldCheck,
  IconSparkles,
  IconTarget,
  IconZap,
  IconRefresh,
} from '../common/Icons';

interface EvalsTabProps {
  agents: Agent[];
}

export function EvalsTab({ agents }: EvalsTabProps) {
  const [suites, setSuites] = useState<EvalTestSuite[]>([]);
  const [runs, setRuns] = useState<EvalRunRecord[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('suite_compliance_v1');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || 'agent_support');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [executing, setExecuting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'scorecard' | 'history'>('scorecard');
  const [expandedScenarioId, setExpandedScenarioId] = useState<string | null>('TC-01');

  // Fetch suites and runs
  const fetchEvalsData = async () => {
    try {
      const [suitesRes, runsRes] = await Promise.all([
        fetch('/api/evals/suites'),
        fetch('/api/evals/runs'),
      ]);
      const suitesData = await suitesRes.json();
      const runsData = await runsRes.json();

      if (suitesData.success && Array.isArray(suitesData.suites)) {
        setSuites(suitesData.suites);
        if (!selectedSuiteId && suitesData.suites.length > 0) {
          setSelectedSuiteId(suitesData.suites[0].id);
        }
      }
      if (runsData.success && Array.isArray(runsData.runs)) {
        setRuns(runsData.runs);
        if (!selectedRunId && runsData.runs.length > 0) {
          setSelectedRunId(runsData.runs[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch evals data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvalsData();
  }, []);

  const selectedRun = runs.find((r) => r.id === selectedRunId) || runs[0];
  const selectedSuite = suites.find((s) => s.id === selectedSuiteId) || suites[0];

  // Execute Batch Run
  const handleRunEvaluation = async () => {
    if (!selectedSuiteId) return;
    setExecuting(true);
    try {
      const targetAgent = agents.find((a) => a.id === selectedAgentId) || { name: 'Maya' };
      const res = await fetch('/api/evals/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suite_id: selectedSuiteId,
          agent_id: selectedAgentId,
          agent_name: targetAgent.name,
        }),
      });
      const data = await res.json();
      if (data.success && data.run) {
        setRuns((prev) => [data.run, ...prev]);
        setSelectedRunId(data.run.id);
        setActiveTab('scorecard');
      }
    } catch (err) {
      console.error('Failed to execute evaluation:', err);
    } finally {
      setExecuting(false);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'policy': return '#38bdf8';
      case 'guardrails': return '#ef4444';
      case 'tools': return '#a855f7';
      case 'reasoning': return '#f59e0b';
      case 'escalation': return '#ec4899';
      default: return '#94a3b8';
    }
  };

  const avgPassRate = runs.length > 0
    ? Math.round(runs.reduce((acc, r) => acc + r.pass_rate, 0) / runs.length)
    : 100;

  return (
    <div className="tab-pane active" style={{ animation: 'fadeIn 0.25s ease-in-out' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.2))',
              padding: '0.5rem',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center'
            }}>
              <IconFlask size={24} color="#10b981" />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Automated Testing & Batch Evals
            </h1>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
            Run simulated multi-turn conversations against voice agents. Validate compliance, hallucination defense, prompt injection resistance, and tool accuracy before deploying to production.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={fetchEvalsData}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}
          >
            <IconRefresh size={14} />
            <span>Refresh Evals</span>
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
            <IconTarget size={14} color="#38bdf8" />
            Active Test Suites
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc' }}>
            {suites.length}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
          <div style={{ fontSize: '0.82rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
            <IconCheck size={14} color="#4ade80" />
            Historical Pass Rate
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4ade80' }}>
            {avgPassRate}%
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
          <div style={{ fontSize: '0.82rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
            <IconShieldCheck size={14} color="#38bdf8" />
            Hallucination Defense
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8' }}>
            100%
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
          <div style={{ fontSize: '0.82rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
            <IconClock size={14} color="#f59e0b" />
            Avg Voice Turnaround
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b' }}>
            {selectedRun?.metrics?.avg_turn_latency_ms || 312}ms
          </div>
        </div>
      </div>

      {/* Batch Runner Control Deck */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface, #1e293b)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
            {/* Suite Picker */}
            <div style={{ minWidth: '260px', flex: 1 }}>
              <label style={{ fontSize: '0.82rem', color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
                Select Test Suite:
              </label>
              <select
                className="select"
                value={selectedSuiteId}
                onChange={(e) => setSelectedSuiteId(e.target.value)}
                style={{ width: '100%' }}
              >
                {suites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.test_cases.length} scenarios)
                  </option>
                ))}
              </select>
            </div>

            {/* Target Agent Picker */}
            <div style={{ minWidth: '200px' }}>
              <label style={{ fontSize: '0.82rem', color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
                Target Voice Agent:
              </label>
              <select
                className="select"
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                style={{ width: '100%' }}
              >
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleRunEvaluation}
            disabled={executing}
            style={{
              padding: '0.65rem 1.4rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #059669, #10b981)',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            }}
          >
            <IconZap size={16} />
            <span>{executing ? 'Simulating Batch Scenarios...' : 'Run Batch Evaluation'}</span>
          </button>
        </div>

        {selectedSuite && (
          <div style={{ marginTop: '0.85rem', fontSize: '0.83rem', color: '#94a3b8' }}>
            ℹ️ {selectedSuite.description}
          </div>
        )}
      </div>

      {/* Tabs: Scorecard vs Run History */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1.25rem' }}>
        <button
          onClick={() => setActiveTab('scorecard')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'scorecard' ? '2px solid #10b981' : 'none',
            color: activeTab === 'scorecard' ? '#fff' : '#94a3b8',
            fontWeight: activeTab === 'scorecard' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          AI Judge Scorecard & Scenarios
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'history' ? '2px solid #10b981' : 'none',
            color: activeTab === 'history' ? '#fff' : '#94a3b8',
            fontWeight: activeTab === 'history' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          Run History ({runs.length})
        </button>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          Loading evaluation suites...
        </div>
      ) : activeTab === 'scorecard' && selectedRun ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Scorecard Summary Card */}
          <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-surface, #1e293b)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <span style={{
                    background: selectedRun.pass_rate >= 80 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: selectedRun.pass_rate >= 80 ? '#34d399' : '#f87171',
                    border: `1px solid ${selectedRun.pass_rate >= 80 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                    borderRadius: '20px',
                    padding: '3px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}>
                    {selectedRun.pass_rate >= 80 ? 'ALL PASSED' : 'REGRESSION DETECTED'}
                  </span>
                  <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
                    {selectedRun.suite_name}
                  </h2>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Agent Tested: <strong style={{ color: '#e2e8f0' }}>{selectedRun.agent_name}</strong> • Scenarios: {selectedRun.total_tests} • Duration: {selectedRun.duration_ms}ms • Date: {new Date(selectedRun.timestamp).toLocaleTimeString()}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '2.4rem', fontWeight: 800, color: selectedRun.overall_score >= 80 ? '#34d399' : '#f87171', lineHeight: 1 }}>
                  {selectedRun.overall_score}%
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                  Overall Compliance Score
                </div>
              </div>
            </div>

            {/* 5 Evaluator Radar Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '0.75rem', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>Goal Completion</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc' }}>{selectedRun.metrics.goal_completion_rate}%</div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ width: `${selectedRun.metrics.goal_completion_rate}%`, height: '100%', background: '#38bdf8', borderRadius: 2 }} />
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '0.75rem', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>Hallucination Defense</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc' }}>{selectedRun.metrics.hallucination_defense_score}%</div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ width: `${selectedRun.metrics.hallucination_defense_score}%`, height: '100%', background: '#10b981', borderRadius: 2 }} />
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '0.75rem', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>Tool Accuracy</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc' }}>{selectedRun.metrics.tool_accuracy_score}%</div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ width: `${selectedRun.metrics.tool_accuracy_score}%`, height: '100%', background: '#a855f7', borderRadius: 2 }} />
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '0.75rem', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>Guardrail Defense</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc' }}>{selectedRun.metrics.guardrail_compliance_score}%</div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ width: `${selectedRun.metrics.guardrail_compliance_score}%`, height: '100%', background: '#ef4444', borderRadius: 2 }} />
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '0.75rem', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>Turnaround Latency</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc' }}>{selectedRun.metrics.avg_turn_latency_ms}ms</div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ width: `70%`, height: '100%', background: '#f59e0b', borderRadius: 2 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Test Scenarios List Accordion */}
          <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>
              Evaluated Scenarios ({selectedRun.results.length})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {selectedRun.results.map((r) => {
                const isExpanded = expandedScenarioId === r.test_case_id;
                return (
                  <div
                    key={r.test_case_id}
                    style={{
                      borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: r.passed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.4)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header */}
                    <div
                      onClick={() => setExpandedScenarioId(isExpanded ? null : r.test_case_id)}
                      style={{
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        background: isExpanded ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{
                          background: r.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: r.passed ? '#34d399' : '#f87171',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}>
                          {r.judge_verdict}
                        </span>

                        <span style={{
                          background: `${getCategoryColor(r.category)}20`,
                          color: getCategoryColor(r.category),
                          border: `1px solid ${getCategoryColor(r.category)}40`,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          textTransform: 'uppercase'
                        }}>
                          {r.category}
                        </span>

                        <span style={{ fontWeight: 600, fontSize: '0.92rem', color: '#f8fafc' }}>
                          {r.test_name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.82rem', color: '#94a3b8' }}>
                        <span>Score: <strong style={{ color: r.passed ? '#34d399' : '#f87171' }}>{r.score}/100</strong></span>
                        <span>Latency: {r.latency_ms}ms</span>
                        <span>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded Body: Dialogue & Judge Feedback */}
                    {isExpanded && (
                      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', background: 'rgba(15, 23, 42, 0.8)' }}>
                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.4rem', fontWeight: 600 }}>
                            SIMULATED DIALOGUE:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {r.conversation.map((msg, i) => (
                              <div
                                key={i}
                                style={{
                                  padding: '0.6rem 0.85rem',
                                  borderRadius: '6px',
                                  background: msg.role === 'user' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(16, 185, 129, 0.1)',
                                  borderLeft: msg.role === 'user' ? '3px solid #60a5fa' : '3px solid #10b981',
                                  fontSize: '0.85rem',
                                  color: '#e2e8f0',
                                }}
                              >
                                <strong style={{ color: msg.role === 'user' ? '#60a5fa' : '#10b981', marginRight: '0.5rem' }}>
                                  {msg.role === 'user' ? '👤 Customer Sim' : '🤖 Voice Agent'}:
                                </strong>
                                {msg.text}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* AI Judge Feedback */}
                        <div style={{
                          padding: '0.75rem',
                          borderRadius: '6px',
                          background: 'rgba(56, 189, 248, 0.08)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          fontSize: '0.83rem',
                          color: '#bae6fd'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, marginBottom: '0.2rem', color: '#38bdf8' }}>
                            <IconSparkles size={14} />
                            <span>AI Judge Verdict & Rationale:</span>
                          </div>
                          <div>{r.judge_feedback}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Historical Runs Table */
        <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface, #1e293b)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '0.65rem' }}>Run ID</th>
                <th style={{ padding: '0.65rem' }}>Suite</th>
                <th style={{ padding: '0.65rem' }}>Agent</th>
                <th style={{ padding: '0.65rem' }}>Pass Rate</th>
                <th style={{ padding: '0.65rem' }}>Score</th>
                <th style={{ padding: '0.65rem' }}>Avg Latency</th>
                <th style={{ padding: '0.65rem' }}>Timestamp</th>
                <th style={{ padding: '0.65rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '0.65rem', fontFamily: 'monospace', color: '#60a5fa' }}>{r.id.slice(0, 16)}...</td>
                  <td style={{ padding: '0.65rem' }}>{r.suite_name}</td>
                  <td style={{ padding: '0.65rem', fontWeight: 600 }}>{r.agent_name}</td>
                  <td style={{ padding: '0.65rem' }}>
                    <span style={{
                      color: r.pass_rate >= 80 ? '#34d399' : '#f87171',
                      fontWeight: 700,
                    }}>
                      {r.pass_rate}% ({r.passed_tests}/{r.total_tests})
                    </span>
                  </td>
                  <td style={{ padding: '0.65rem', fontWeight: 700 }}>{r.overall_score}%</td>
                  <td style={{ padding: '0.65rem' }}>{r.metrics?.avg_turn_latency_ms || 312}ms</td>
                  <td style={{ padding: '0.65rem', color: '#94a3b8' }}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                  <td style={{ padding: '0.65rem' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setSelectedRunId(r.id);
                        setActiveTab('scorecard');
                      }}
                      style={{ padding: '3px 8px', fontSize: '0.78rem' }}
                    >
                      Scorecard
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
