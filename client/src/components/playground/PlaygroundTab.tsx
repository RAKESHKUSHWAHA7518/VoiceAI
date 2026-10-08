// ============================================================================
// Playground Tab Component
// ============================================================================

import { useState, useCallback } from 'react';
import type { PlaygroundConfig, PlaygroundTest, Agent } from '../../types';

interface PlaygroundTabProps {
  config: PlaygroundConfig;
  setConfig: React.Dispatch<React.SetStateAction<PlaygroundConfig>>;
  tests: PlaygroundTest[];
  sendControl?: (type: string, payload: Record<string, unknown>) => void;
  onRunTest?: (input: string) => Promise<PlaygroundTest | undefined>;
  onPlayVoice?: (text: string, audioUrl?: string) => void;
  testActive?: boolean;
  activeAgent?: Agent | null;
  agents?: Agent[];
  onSelectAgent?: (agent: Agent) => void;
}

export function PlaygroundTab({
  config,
  setConfig,
  tests,
  sendControl,
  onRunTest,
  onPlayVoice,
  testActive,
  activeAgent,
  agents,
  onSelectAgent,
}: PlaygroundTabProps) {
  const [testInput, setTestInput] = useState('Hello, how are you?');
  const [playgroundTests, setPlaygroundTests] = useState<PlaygroundTest[]>([]);
  const [playgroundTestActive, setPlaygroundTestActive] = useState(false);

  const displayTests = tests.length > 0 ? tests : playgroundTests;
  const isRunning = testActive || playgroundTestActive;

  const handleConfigChange = useCallback((key: keyof PlaygroundConfig, value: string | number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, [setConfig]);

  const handleRunTest = useCallback(async () => {
    if (!testInput.trim()) return;
    setPlaygroundTestActive(true);
    try {
      if (onRunTest) {
        const test = await onRunTest(testInput);
        if (test) {
          setPlaygroundTests(prev => [test, ...(Array.isArray(prev) ? prev : [])]);
        }
      } else {
        const res = await fetch('/api/playground/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: testInput,
            agent_id: activeAgent?.id,
            agent_name: activeAgent?.name,
            voice_id: config.voice_id,
            system_prompt: config.system_prompt,
            llm_model: config.llm_model,
            llm_temperature: config.llm_temperature,
            assigned_tools: activeAgent?.assigned_tools,
          }),
        });
        const data = await res.json();
        if (data.test) {
          setPlaygroundTests(prev => [data.test, ...(Array.isArray(prev) ? prev : [])]);
          if (data.test.output && onPlayVoice) {
            onPlayVoice(data.test.output, data.test.audio_url);
          }
        }
      }
    } catch (e) {
      console.error('Test failed:', e);
    } finally {
      setPlaygroundTestActive(false);
    }
  }, [testInput, onRunTest, onPlayVoice, activeAgent, config]);

  const resetPlaygroundConfig = useCallback(() => {
    fetch('/api/playground/config')
      .then(r => r.json())
      .then(config => setConfig(config));
  }, [setConfig]);

  const savePlaygroundConfig = useCallback(async () => {
    try {
      if (sendControl) {
        sendControl('update_playground_config', { config });
      }
      await fetch('/api/playground/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }, [config, sendControl]);

  const saveSystemPrompt = useCallback(() => {
    alert('System prompt saved!');
  }, []);

  const resetSystemPrompt = useCallback(() => {
    fetch('/api/playground/config')
      .then(r => r.json())
      .then(config => {
        const textarea = document.getElementById('systemPrompt') as HTMLTextAreaElement;
        if (textarea) textarea.value = config.system_prompt || '';
      });
  }, []);

  return (
    <>
      {/* Active Agent Banner */}
      {activeAgent && (
        <div className="active-agent-banner">
          <div className="agent-banner-info">
            <span className="agent-banner-avatar">{activeAgent.avatar || '🤖'}</span>
            <div>
              <div className="agent-banner-title">
                Active Testing Agent: <strong>{activeAgent.name}</strong>
              </div>
              <div className="agent-banner-role">
                {activeAgent.role} • Model: <span className="banner-tag">{activeAgent.llm_model}</span>
                {activeAgent.assigned_tools && activeAgent.assigned_tools.length > 0 && (
                  <span className="banner-tools"> • Tools: {activeAgent.assigned_tools.join(', ')}</span>
                )}
              </div>
            </div>
          </div>

          {agents && agents.length > 1 && onSelectAgent && (
            <div className="agent-banner-switch">
              <label>Switch Agent:</label>
              <select
                className="form-select form-select-sm"
                value={activeAgent.id}
                onChange={e => {
                  const found = agents.find(a => a.id === e.target.value);
                  if (found) onSelectAgent(found);
                }}
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.avatar} {a.name} ({a.role})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="playground-grid">
        {/* Configuration Panel */}
        <div className="playground-panel">
          <h3>Voice & Model Configuration</h3>
          
          <div className="form-group">
            <label className="form-label">Voice ID</label>
            <input
              type="text"
              className="form-input"
              id="voiceId"
              value={config.voice_id}
              onChange={(e) => handleConfigChange('voice_id', e.target.value)}
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">LLM Model</label>
            <select className="form-select" id="llmModel" value={config.llm_model} onChange={(e) => handleConfigChange('llm_model', e.target.value)}>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>
          
          <div className="form-group">
            <label className="form-label">LLM Temperature <span id="tempValue">{config.llm_temperature}</span></label>
            <div className="slider-group">
              <input
                type="range"
                className="form-input"
                id="llmTemperature"
                min="0"
                max="1"
                step="0.1"
                value={config.llm_temperature}
                onChange={(e) => handleConfigChange('llm_temperature', parseFloat(e.target.value))}
              />
              <span className="slider-value" id="tempValueDisplay">{config.llm_temperature}</span>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">VAD Threshold <span id="vadThresholdValue">{config.vad_threshold}</span></label>
            <div className="slider-group">
              <input
                type="range"
                className="form-input"
                id="vadThreshold"
                min="0.1"
                max="0.9"
                step="0.05"
                value={config.vad_threshold}
                onChange={(e) => handleConfigChange('vad_threshold', parseFloat(e.target.value))}
              />
              <span className="slider-value" id="vadThresholdDisplay">{config.vad_threshold}</span>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">SOS Debounce (ms) <span id="sosDebounceValue">{config.vad_sos_debounce_ms}</span></label>
            <div className="slider-group">
              <input
                type="range"
                className="form-input"
                id="sosDebounce"
                min="50"
                max="300"
                step="10"
                value={config.vad_sos_debounce_ms}
                onChange={(e) => handleConfigChange('vad_sos_debounce_ms', parseInt(e.target.value))}
              />
              <span className="slider-value" id="sosDebounceDisplay">{config.vad_sos_debounce_ms}</span>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">EOS Timeout (ms) <span id="eosTimeoutValue">{config.vad_eos_timeout_ms}</span></label>
            <div className="slider-group">
              <input
                type="range"
                className="form-input"
                id="eosTimeout"
                min="200"
                max="1000"
                step="50"
                value={config.vad_eos_timeout_ms}
                onChange={(e) => handleConfigChange('vad_eos_timeout_ms', parseInt(e.target.value))}
              />
              <span className="slider-value" id="eosTimeoutDisplay">{config.vad_eos_timeout_ms}</span>
            </div>
          </div>
          
          <div className="btn-group">
            <button className="btn btn-primary" onClick={savePlaygroundConfig}>Save Config</button>
            <button className="btn btn-secondary" onClick={resetPlaygroundConfig}>Reset</button>
          </div>
        </div>
        
        {/* System Prompt Panel */}
        <div className="playground-panel">
          <h3>System Prompt</h3>
          <textarea
            className="form-textarea"
            id="systemPrompt"
            value={config.system_prompt}
            onChange={(e) => handleConfigChange('system_prompt', e.target.value)}
          />
          <div className="btn-group">
            <button className="btn btn-primary" onClick={saveSystemPrompt}>Save Prompt</button>
            <button className="btn btn-secondary" onClick={resetSystemPrompt}>Reset to Default</button>
          </div>
        </div>
      </div>
      
      {/* Test Panel */}
      <div className="card" style={{ gridColumn: '1 / -1', marginTop: '1.5rem' }}>
        <h3>Test Conversation</h3>
        <div className="playground-grid">
          <div className="playground-panel">
            <h3>Test Input</h3>
            <textarea
              className="form-textarea"
              id="testInput"
              placeholder="Enter test message..."
              rows={4}
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
            />
            <div className="btn-group">
              <button className="btn btn-success" onClick={handleRunTest} disabled={isRunning}>
                {isRunning ? 'Running...' : 'Run Test'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setPlaygroundTests([]); }}>Clear View</button>
            </div>
          </div>
          
          <div className="playground-panel">
            <h3>Test Output</h3>
            <div className="playground-output" id="testOutput">
              {displayTests.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                  No test run yet. Type a message and click "Run Test" above.
                </div>
              ) : (
                displayTests.map((test) => (
                  <div key={test.test_id} className="output-entry">
                    <div className="output-label">
                      {new Date(test.timestamp > 1e11 ? test.timestamp : test.timestamp * 1000).toLocaleTimeString()} - Test {test.test_id}
                      <span style={{ 
                        color: test.status === 'running' ? '#fbbf24' : 
                               test.status === 'completed' ? '#22c55e' : '#ef4444',
                        marginLeft: '0.5rem'
                      }}>
                        ● {test.status}
                      </span>
                    </div>
                    <div className="output-text">{test.output || (test.status === 'running' ? 'Processing...' : 'No output')}</div>
                    <div className="output-meta">Input: {test.input} | Latency: {test.latency_ms || '?'}ms</div>
                    {test.output && onPlayVoice && test.status === 'completed' && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            padding: '0.2rem 0.6rem',
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            cursor: 'pointer',
                          }}
                          onClick={() => onPlayVoice(test.output!, test.audio_url)}
                        >
                          🔊 Play Voice
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        {/* Test History */}
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Test History</h3>
          <div className="playground-output" id="testHistory">
            {displayTests.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                No tests run yet. Run a test to see history here.
              </div>
            ) : (
              displayTests.map((test) => (
                test.status === 'completed' && (
                  <div key={test.test_id} className="output-entry">
                    <div className="output-label">{new Date(test.timestamp > 1e11 ? test.timestamp : test.timestamp * 1000).toLocaleTimeString()} - Test {test.test_id}</div>
                    <div className="output-text">Input: {test.input}</div>
                    <div className="output-meta">Latency: {test.latency_ms || '?'}ms | Output: {test.output?.substring(0, 100) || '...'}</div>
                    {test.output && onPlayVoice && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            padding: '0.2rem 0.6rem',
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            cursor: 'pointer',
                          }}
                          onClick={() => onPlayVoice(test.output!, test.audio_url)}
                        >
                          🔊 Play Voice
                        </button>
                      </div>
                    )}
                  </div>
                )
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}