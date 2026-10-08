// ============================================================================
// Inspector & Custom Tools Tab Component
// ============================================================================

import React, { useState, useEffect } from 'react';
import type { TranscriptMsg, BargeInEvent, ToolCall, ToolItem } from '../../types';

interface InspectorTabProps {
  transcripts: TranscriptMsg[];
  bargeInEvents: BargeInEvent[];
  toolCalls: ToolCall[];
}

export function InspectorTab({ transcripts, bargeInEvents, toolCalls }: InspectorTabProps) {
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [loadingTools, setLoadingTools] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  
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

  useEffect(() => {
    fetchTools();
  }, []);

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
      {/* Custom Tools Management Card */}
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Function Tools & Custom Registry</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Built-in and custom tools callable by voice agents during conversations. Create custom tools with mock JSON or webhook integrations.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + Create Custom Tool
          </button>
        </div>

        {/* Tools Grid */}
        {loadingTools ? (
          <div style={{ color: '#64748b', padding: '1.5rem', textAlign: 'center' }}>Loading tools...</div>
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
              <span style={{ fontWeight: 600, color: '#38bdf8' }}>
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
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
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
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>
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
        <h2>Live Transcript Inspector</h2>
        <div className="transcript-list" id="transcriptList">
          {transcripts.length === 0 ? (
            <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
              No transcript data yet. Start a conversation to see transcripts here.
            </div>
          ) : (
            transcripts.map((t, i) => (
              <div key={i} className="transcript-item">
                <span className={`transcript-role ${t.role}`}>
                  {t.role === 'user' ? '👤 User' : t.role === 'assistant' ? '🤖 Agent' : '⚙️ System'}
                </span>
                <span className="transcript-text">
                  {t.text} {t.is_final ? '' : ' <span class="barge-in-badge">interim</span>'}
                </span>
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
            <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
              No barge-in events recorded
            </div>
          ) : (
            bargeInEvents.map((e, i) => (
              <div key={i} className="transcript-item" style={{ borderLeft: '3px solid #ef4444' }}>
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
            <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f1f5f9', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="execType"
                      checked={execType === 'mock'}
                      onChange={() => setExecType('mock')}
                    />
                    <span>🧪 Simulated Mock Response (JSON Template)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f1f5f9', cursor: 'pointer' }}>
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