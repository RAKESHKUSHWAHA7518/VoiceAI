import React, { useState, useEffect } from 'react';
import type { TranscriptMsg, BargeInEvent, ToolCall, ToolItem, UserAccount, AuditLogEntry, VaultKeyRecord } from '../../types';

interface InspectorTabProps {
  transcripts: TranscriptMsg[];
  bargeInEvents: BargeInEvent[];
  toolCalls: ToolCall[];
  onRewind?: (turnIndex: number) => void;
}

export function InspectorTab({ transcripts, bargeInEvents, toolCalls, onRewind }: InspectorTabProps) {
  const [subTab, setSubTab] = useState<'tools' | 'security'>('tools');
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [loadingTools, setLoadingTools] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  // Security Console state
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [allUsers, setAllUsers] = useState<UserAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [vaultKeys, setVaultKeys] = useState<VaultKeyRecord[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState<boolean>(false);
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null);
  const [encryptInput, setEncryptInput] = useState<string>('Caller SSN: 123-45-6789 | Card: 4111-2222-3333-4444 | Medical: Allergy to Penicillin');
  const [encryptedResult, setEncryptedResult] = useState<any>(null);
  const [decryptedResult, setDecryptedResult] = useState<string | null>(null);
  const [cryptoProcessing, setCryptoProcessing] = useState<boolean>(false);
  
  // Custom tool form state
  const [toolName, setToolName] = useState<string>('');
  const [toolLabel, setToolLabel] = useState<string>('');
  const [toolDesc, setToolDesc] = useState<string>('');
  const [paramName, setParamName] = useState<string>('query');
  const [paramDesc, setParamDesc] = useState<string>('Lookup query or ID');
  const [execType, setExecType] = useState<'mock' | 'webhook'>('mock');
  const [mockResponse, setMockResponse] = useState<string>('{\n  "status": "success",\n  "result": "Sample data returned"\n}');
  const [webhookUrl, setWebhookUrl] = useState<string>('https://httpbin.org/post');
  const [savingTool, setSavingTool] = useState<boolean>(false);

  // Testing tool state
  const [activeTestTool, setActiveTestTool] = useState<string | null>(null);
  const [testArgInput, setTestArgInput] = useState<string>('{"location": "San Francisco"}');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState<boolean>(false);

  const fetchTools = async () => {
    try {
      setLoadingTools(true);
      const res = await fetch('/api/tools');
      const data = await res.json();
      if (data.tools) {
        setTools(data.tools);
      }
    } catch (err) {
      console.error('Failed to fetch tools:', err);
    } finally {
      setLoadingTools(false);
    }
  };

  const fetchSecurityData = async () => {
    setLoadingSecurity(true);
    try {
      const [meRes, usersRes, logsRes, vaultRes] = await Promise.all([
        fetch('/api/security/me').then(r => r.json()),
        fetch('/api/security/users').then(r => r.json()),
        fetch('/api/security/audit-logs').then(r => r.json()).catch(() => ({ logs: [] })),
        fetch('/api/security/vault').then(r => r.json()),
      ]);
      if (meRes.user) setCurrentUser(meRes.user);
      if (usersRes.users) setAllUsers(usersRes.users);
      if (logsRes.logs) setAuditLogs(logsRes.logs);
      if (vaultRes.keys) setVaultKeys(vaultRes.keys);
    } catch (err) {
      console.error('Failed to load security data:', err);
    } finally {
      setLoadingSecurity(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  useEffect(() => {
    if (subTab === 'security') {
      fetchSecurityData();
    }
  }, [subTab]);

  const handleSwitchRole = async (userId: string) => {
    try {
      const res = await fetch('/api/security/switch-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user);
        fetchSecurityData();
      }
    } catch (err) {
      console.error('Switch error:', err);
    }
  };

  const handleRotateKey = async (keyId: string) => {
    setRotatingKeyId(keyId);
    try {
      const res = await fetch('/api/security/vault/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      });
      const data = await res.json();
      if (data.success) {
        fetchSecurityData();
      } else {
        alert(`Key rotation forbidden: ${data.error?.message || 'Access denied'}`);
      }
    } catch (err: any) {
      alert(`Rotation error: ${err.message}`);
    } finally {
      setRotatingKeyId(null);
    }
  };

  const handleEncrypt = async () => {
    if (!encryptInput.trim()) return;
    setCryptoProcessing(true);
    try {
      const res = await fetch('/api/security/crypto/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: encryptInput }),
      });
      const data = await res.json();
      if (data.payload) {
        setEncryptedResult(data.payload);
        setDecryptedResult(null);
      }
    } catch (err) {
      console.error('Encrypt failed:', err);
    } finally {
      setCryptoProcessing(false);
    }
  };

  const handleDecrypt = async () => {
    if (!encryptedResult) return;
    setCryptoProcessing(true);
    try {
      const res = await fetch('/api/security/crypto/decrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encryptedResult),
      });
      const data = await res.json();
      if (data.plaintext) {
        setDecryptedResult(data.plaintext);
      }
    } catch (err) {
      console.error('Decrypt failed:', err);
    } finally {
      setCryptoProcessing(false);
    }
  };

  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toolName.trim() || !toolDesc.trim()) return;

    setSavingTool(true);
    try {
      const payload = {
        name: toolName.trim(),
        label: toolLabel.trim() || toolName.trim(),
        description: toolDesc.trim(),
        parameters: {
          type: 'object',
          properties: {
            [paramName.trim() || 'query']: {
              type: 'string',
              description: paramDesc.trim() || 'Argument parameter',
            },
          },
          required: [paramName.trim() || 'query'],
        },
        execution_type: execType,
        mock_response: execType === 'mock' ? mockResponse : undefined,
        webhook_url: execType === 'webhook' ? webhookUrl : undefined,
      };

      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.tools) {
        setTools(data.tools);
        setShowCreateModal(false);
        // Reset form
        setToolName('');
        setToolLabel('');
        setToolDesc('');
      }
    } catch (err) {
      console.error('Failed to create tool:', err);
    } finally {
      setSavingTool(false);
    }
  };

  const handleDeleteTool = async (name: string) => {
    if (!confirm(`Delete custom tool "${name}"?`)) return;
    try {
      const res = await fetch(`/api/tools/${name}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.tools) {
        setTools(data.tools);
        if (activeTestTool === name) {
          setActiveTestTool(null);
          setTestResult(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete tool:', err);
    }
  };

  const handleTestTool = async (tool: ToolItem) => {
    setActiveTestTool(tool.name);
    setTesting(true);
    setTestResult(null);

    let parsedArgs = {};
    try {
      parsedArgs = JSON.parse(testArgInput);
    } catch {
      parsedArgs = { query: testArgInput };
    }

    try {
      const res = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: tool.name,
          args: parsedArgs,
        }),
      });
      const data = await res.json();
      setTestResult(data.result || data);
    } catch (err: any) {
      setTestResult({ error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const openTestBoxForTool = (tool: ToolItem) => {
    setActiveTestTool(tool.name);
    setTestResult(null);
    if (tool.name === 'get_weather') {
      setTestArgInput('{"location": "Tokyo"}');
    } else if (tool.name === 'check_booking') {
      setTestArgInput('{"booking_id": "BK-9842"}');
    } else if (tool.name === 'transfer_call') {
      setTestArgInput('{"department": "Support"}');
    } else {
      const firstProp = Object.keys(tool.parameters?.properties || {})[0] || 'query';
      setTestArgInput(`{"${firstProp}": "test_value"}`);
    }
  };

  return (
    <div className="grid">
      {/* Top Sub-Tab Navigation Bar */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.75rem', marginBottom: '0.25rem' }}>
        <button
          className={`btn ${subTab === 'tools' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSubTab('tools')}
          style={{ fontWeight: 600 }}
        >
          🛠️ Function Tools & Dialogue Inspector
        </button>
        <button
          className={`btn ${subTab === 'security' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSubTab('security')}
          style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          🛡️ Enterprise Security, RBAC & SOC2/HIPAA Console
        </button>
      </div>

      {subTab === 'tools' ? (
        <>
          {/* Custom Tools Management Card */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>Function Tools & Custom Registry</h2>
            <p style={{ color: 'var(--studio-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Built-in and custom tools callable by voice agents during conversations. Create custom tools with mock JSON or webhook integrations.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + Create Custom Tool
          </button>
        </div>

        {/* Tools Grid */}
        {loadingTools ? (
          <div style={{ color: 'var(--studio-muted)', padding: '1.5rem', textAlign: 'center' }}>Loading tools...</div>
        ) : (
          <div className="tools-management-grid">
            {tools.map((t) => (
              <div key={t.name} className={`tool-item-card ${t.is_custom ? 'tool-item-custom' : ''}`}>
                <div className="tool-item-header">
                  <div>
                    <h3 className="tool-item-title">{t.label || t.name}</h3>
                    <code className="tool-item-code">{t.name}()</code>
                  </div>
                  <span className={`tool-badge ${t.is_custom ? 'badge-custom' : 'badge-builtin'}`}>
                    {t.is_custom ? (t.execution_type === 'webhook' ? '🌐 Webhook' : '🧪 Custom') : '⚡ Built-in'}
                  </span>
                </div>

                <p className="tool-item-desc">{t.description}</p>

                <div className="tool-item-params">
                  <span className="param-label">Parameters:</span>
                  <div className="param-tags">
                    {Object.keys(t.parameters?.properties || {}).map(prop => (
                      <span key={prop} className="param-pill">
                        {prop}: {t.parameters?.properties?.[prop]?.type || 'string'}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="tool-item-actions">
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => openTestBoxForTool(t)}
                  >
                    🧪 Test Tool
                  </button>
                  {t.is_custom && (
                    <button 
                      className="btn btn-danger btn-sm" 
                      onClick={() => handleDeleteTool(t.name)}
                      title="Delete this custom tool"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inline Tool Tester */}
        {activeTestTool && (
          <div className="tool-test-runner">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--studio-accent)' }}>
                Test Runner: <code>{activeTestTool}()</code>
              </span>
              <button 
                className="btn btn-outline btn-sm" 
                onClick={() => { setActiveTestTool(null); setTestResult(null); }}
              >
                Close Tester
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--studio-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Arguments JSON:
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={testArgInput}
                  onChange={e => setTestArgInput(e.target.value)}
                  placeholder='{"key": "value"}'
                />
              </div>
              <button
                className="btn btn-success"
                style={{ marginTop: '1.25rem' }}
                onClick={() => {
                  const tool = tools.find(t => t.name === activeTestTool);
                  if (tool) handleTestTool(tool);
                }}
                disabled={testing}
              >
                {testing ? 'Executing...' : 'Run Test'}
              </button>
            </div>

            {testResult && (
              <div style={{ marginTop: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--studio-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                  Execution Result:
                </span>
                <pre className="tool-result-preview">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Transcript */}
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Live Transcript & Time-Travel Inspector</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--studio-secondary)' }}>
            Click ⏪ on prior turns to time-travel rewind conversation state
          </span>
        </div>
        <div className="transcript-list" id="transcriptList">
          {transcripts.length === 0 ? (
            <div style={{ color: 'var(--studio-muted)', textAlign: 'center', padding: '2rem' }}>
              No transcript data yet. Start a conversation to see transcripts here.
            </div>
          ) : (
            transcripts.map((t, i) => (
              <div key={i} className="transcript-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  <span className={`transcript-role ${t.role}`}>
                    {t.role === 'user' ? '👤 User' : t.role === 'assistant' ? '🤖 Agent' : '⚙️ System'}
                  </span>
                  <span className="transcript-text">
                    {t.text} {t.is_final ? '' : ' (interim)'}
                  </span>
                </div>
                {onRewind && i < transcripts.length - 1 && (
                  <button
                    className="btn btn-outline btn-xs"
                    style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '4px' }}
                    title="Time-Travel: Rewind conversation to this turn"
                    onClick={() => onRewind(i)}
                  >
                    ⏪ Rewind Here
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Barge-in Events */}
      <div className="card">
        <h2>Barge-in Events</h2>
        <div id="bargeInList" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {bargeInEvents.length === 0 ? (
            <div style={{ color: 'var(--studio-muted)', textAlign: 'center', padding: '2rem' }}>
              No barge-in events recorded
            </div>
          ) : (
            bargeInEvents.map((e, i) => (
              <div key={i} className="transcript-item" style={{ borderLeft: '3px solid var(--studio-danger)' }}>
                <strong>🚨 Barge-in</strong> at {new Date(e.timestamp).toLocaleTimeString()} <span className="barge-in-badge">INTERRUPT</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Tool Calls */}
      <div className="card">
        <h2>Tool Calls Inspector</h2>
        <div id="toolCallList" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {toolCalls.length === 0 ? (
            <div style={{ color: 'var(--studio-muted)', textAlign: 'center', padding: '2rem' }}>
              No tool calls recorded
            </div>
          ) : (
            toolCalls.map((tc, i) => (
              <div key={i} className="tool-call">
                <span className="tool-call-name">{tc.tool_name}</span>
                <span className={`tool-call-status ${tc.status}`}>{tc.status || 'pending'}</span>
                <br />
                <small>Args: {JSON.stringify(tc.args)}</small>
              </div>
            ))
          )}
        </div>
      </div>
      </>
    ) : (
      <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* RBAC Session & Permissions Matrix Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🛡️</span> Role-Based Access Control (RBAC) & Active Session
              </h2>
              <p style={{ color: 'var(--studio-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Multi-tenant authorization boundaries enforcing least privilege for voice agents, knowledge files, and recordings.
              </p>
            </div>

            {/* User Role Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.04)', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--studio-secondary)' }}>Active Session:</span>
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto', background: 'var(--studio-inset)', color: 'var(--studio-text)', fontSize: '0.8rem' }}
                value={currentUser?.id || 'user_admin'}
                onChange={e => handleSwitchRole(e.target.value)}
              >
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.avatar} {u.name} — {u.role.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {currentUser && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(var(--studio-accent-rgb), 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(var(--studio-accent-rgb), 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.8rem' }}>{currentUser.avatar}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--studio-accent)' }}>{currentUser.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--studio-secondary)' }}>{currentUser.email}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', background: 'var(--studio-accent-strong)', color: 'var(--studio-text)', fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '12px', fontWeight: 600 }}>
                    {currentUser.role.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--studio-secondary)', lineHeight: '1.4' }}>
                  {currentUser.role === 'admin'
                    ? '👑 Full Administrator: Unrestricted provisioning of API keys, model overrides, agent mutation, deletion, and telemetry inspection.'
                    : currentUser.role === 'agent_manager'
                    ? '👩‍💼 Agent Manager: Can configure agent prompts, upload grounding knowledge documents, trigger evaluations, and supervise live HITL calls.'
                    : '🕵️ Auditor / QA: Strict read-only observer. Can review call transcripts, evaluation scores, and audit logs with PII redaction.'}
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--studio-secondary)', marginBottom: '0.6rem' }}>
                  Active Authorized Permissions ({currentUser.permissions.length}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {currentUser.permissions.map(perm => (
                    <span
                      key={perm}
                      style={{
                        background: 'rgba(var(--studio-success-rgb), 0.15)',
                        border: '1px solid rgba(var(--studio-success-rgb), 0.35)',
                        color: 'var(--studio-success)',
                        fontSize: '0.72rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                      }}
                    >
                      ✓ {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SOC2 / HIPAA Immutable Audit Trail Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>📜 SOC2 Type II & HIPAA Immutable Audit Log</h2>
              <p style={{ color: 'var(--studio-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Tamper-proof event journal capturing administrative logins, key rotations, document ingests, and call exports.
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={fetchSecurityData} disabled={loadingSecurity}>
              🔄 Refresh Log
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--studio-secondary)' }}>
                  <th style={{ padding: '0.6rem' }}>Timestamp</th>
                  <th style={{ padding: '0.6rem' }}>Actor</th>
                  <th style={{ padding: '0.6rem' }}>Role</th>
                  <th style={{ padding: '0.6rem' }}>Action</th>
                  <th style={{ padding: '0.6rem' }}>Resource</th>
                  <th style={{ padding: '0.6rem' }}>IP Address</th>
                  <th style={{ padding: '0.6rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(entry => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.6rem', color: 'var(--studio-muted)' }}>
                      {new Date(entry.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{entry.actorName}</td>
                    <td style={{ padding: '0.6rem' }}>
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }}>
                        {entry.actorRole}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem', fontFamily: 'monospace', color: 'var(--studio-accent)' }}>{entry.action}</td>
                    <td style={{ padding: '0.6rem', color: 'var(--studio-secondary)' }}>{entry.resource}</td>
                    <td style={{ padding: '0.6rem', color: 'var(--studio-secondary)' }}>{entry.ipAddress}</td>
                    <td style={{ padding: '0.6rem' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        fontWeight: 700,
                        background: entry.status === 'SUCCESS' ? 'rgba(var(--studio-success-rgb), 0.2)' : 'rgba(var(--studio-danger-rgb), 0.2)',
                        color: entry.status === 'SUCCESS' ? 'var(--studio-success)' : 'var(--studio-danger)',
                      }}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Secret Key Vault Card */}
        <div className="card">
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>🔐 Secret Key Vault & Provider Tokens</h2>
            <p style={{ color: 'var(--studio-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Zero-leak environment vault for third-party voice AI service keys (OpenAI, Deepgram, Cartesia, Twilio, ElevenLabs).
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--studio-secondary)' }}>
                  <th style={{ padding: '0.6rem' }}>Provider Service</th>
                  <th style={{ padding: '0.6rem' }}>Masked Key</th>
                  <th style={{ padding: '0.6rem' }}>Environment</th>
                  <th style={{ padding: '0.6rem' }}>Version</th>
                  <th style={{ padding: '0.6rem' }}>Last Rotated</th>
                  <th style={{ padding: '0.6rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vaultKeys.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{k.displayName}</td>
                    <td style={{ padding: '0.6rem', fontFamily: 'monospace', color: 'var(--studio-accent)' }}>{k.maskedKey}</td>
                    <td style={{ padding: '0.6rem' }}>
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(var(--studio-accent-rgb), 0.15)', color: 'var(--studio-accent)' }}>
                        {k.environment}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem' }}>v{k.version}</td>
                    <td style={{ padding: '0.6rem', color: 'var(--studio-muted)' }}>
                      {new Date(k.lastRotated).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.6rem' }}>
                      <button
                        className="btn btn-outline btn-xs"
                        onClick={() => handleRotateKey(k.id)}
                        disabled={rotatingKeyId === k.id || currentUser?.role === 'auditor_qa'}
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                      >
                        {rotatingKeyId === k.id ? 'Rotating...' : '🔄 Rotate Key'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AES-256-GCM Audio & Sensitive Data Encryption Sandbox */}
        <div className="card">
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>🛡️ AES-256-GCM Audio Recording & Data-at-Rest Encryption Sandbox</h2>
            <p style={{ color: 'var(--studio-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Test real-time military-grade envelope encryption for caller transcripts and WAV recordings satisfying HIPAA § 164.312(a)(2)(iv).
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label className="form-label">Plaintext Caller Payload or Audio Transcript</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={encryptInput}
                onChange={e => setEncryptInput(e.target.value)}
              />
              <button
                className="btn btn-primary"
                style={{ marginTop: '0.6rem' }}
                onClick={handleEncrypt}
                disabled={cryptoProcessing}
              >
                🔒 Encrypt with AES-256-GCM
              </button>
            </div>

            <div>
              <label className="form-label">Ciphertext Envelope (Base64 + 96-bit IV + 128-bit MAC AuthTag)</label>
              {encryptedResult ? (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.85rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                  <div style={{ color: 'var(--studio-accent)', marginBottom: '0.3rem' }}>Algorithm: {encryptedResult.algorithm}</div>
                  <div style={{ wordBreak: 'break-all', color: 'var(--studio-accent)', marginBottom: '0.3rem' }}>
                    <strong>Ciphertext:</strong> {encryptedResult.ciphertext.slice(0, 48)}...
                  </div>
                  <div style={{ color: 'var(--studio-accent)', marginBottom: '0.3rem' }}><strong>IV:</strong> {encryptedResult.iv}</div>
                  <div style={{ color: 'var(--studio-success)', marginBottom: '0.6rem' }}><strong>AuthTag (MAC):</strong> {encryptedResult.authTag}</div>
                  <button
                    className="btn btn-success btn-sm"
                    onClick={handleDecrypt}
                    disabled={cryptoProcessing}
                  >
                    🔓 Verify Tag & Decrypt
                  </button>
                </div>
              ) : (
                <div style={{ color: 'var(--studio-muted)', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', textAlign: 'center' }}>
                  Click "Encrypt with AES-256-GCM" to generate ciphertext envelope.
                </div>
              )}

              {decryptedResult && (
                <div style={{ marginTop: '0.75rem', background: 'rgba(var(--studio-success-rgb), 0.1)', border: '1px solid rgba(var(--studio-success-rgb), 0.3)', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--studio-success)', fontWeight: 600, marginBottom: '0.2rem' }}>
                    ✓ Verified Decrypted Plaintext:
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--studio-text)' }}>{decryptedResult}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

      {/* Custom Tool Creation Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Custom Function Tool</h3>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateTool} className="agent-form">
              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Tool Function Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. lookup_flight or check_order"
                    value={toolName}
                    onChange={e => setToolName(e.target.value)}
                    required
                  />
                  <span className="form-hint">Machine name used by LLM function calling (lowercase with underscores).</span>
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Display Title / Label</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. ✈️ Flight Status Tracker"
                    value={toolLabel}
                    onChange={e => setToolLabel(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tool Description (Instructions for LLM) *</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Explain when and why the agent should invoke this tool (e.g. Lookup real-time flight status, delay info, and gates for a flight number)"
                  value={toolDesc}
                  onChange={e => setToolDesc(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Primary Parameter Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. flight_number or order_id"
                    value={paramName}
                    onChange={e => setParamName(e.target.value)}
                  />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Parameter Description</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Airline flight number (e.g. AA120)"
                    value={paramDesc}
                    onChange={e => setParamDesc(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Execution Handler Type</label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--studio-text)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="execType"
                      checked={execType === 'mock'}
                      onChange={() => setExecType('mock')}
                    />
                    <span>🧪 Simulated Mock Response (JSON Template)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--studio-text)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="execType"
                      checked={execType === 'webhook'}
                      onChange={() => setExecType('webhook')}
                    />
                    <span>🌐 Live External Webhook (HTTP POST)</span>
                  </label>
                </div>
              </div>

              {execType === 'mock' ? (
                <div className="form-group">
                  <label className="form-label">Mock Response JSON Template</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                    value={mockResponse}
                    onChange={e => setMockResponse(e.target.value)}
                  />
                  <span className="form-hint">When the agent calls this tool, this data is formatted and returned to the agent.</span>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Webhook URL (POST endpoint)</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://api.yourdomain.com/tools/flight-info"
                    value={webhookUrl}
                    onChange={e => setWebhookUrl(e.target.value)}
                  />
                  <span className="form-hint">The server will make a POST request with tool arguments to this endpoint.</span>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingTool}>
                  {savingTool ? 'Saving Tool...' : 'Create Custom Tool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}