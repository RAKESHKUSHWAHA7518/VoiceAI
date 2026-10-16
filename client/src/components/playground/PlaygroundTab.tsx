// ============================================================================
// Playground Tab Component
// ============================================================================

import { useState, useCallback } from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { CalendarWidget } from '../calendar/CalendarWidget';
import type { PlaygroundConfig, PlaygroundTest, Agent } from '../../types';

interface PlaygroundTabProps {
  config: PlaygroundConfig;
  setConfig: React.Dispatch<React.SetStateAction<PlaygroundConfig>>;
  tests: PlaygroundTest[];
  sendControl?: (type: string, payload: Record<string, unknown>) => void;
  sendAudioChunk?: (pcm16: Uint8Array) => void;
  onStopAudio?: () => void;
  onRunTest?: (input: string) => Promise<PlaygroundTest | undefined>;
  onPlayVoice?: (text: string, audioUrl?: string) => void;
  testActive?: boolean;
  activeAgent?: Agent | null;
  agents?: Agent[];
  onSelectAgent?: (agent: Agent) => void;
  onStartVoiceCall?: (agent: Agent) => void;
}

export function PlaygroundTab({
  config,
  setConfig,
  tests,
  sendControl,
  sendAudioChunk,
  onStopAudio,
  onRunTest,
  onPlayVoice,
  testActive,
  activeAgent,
  agents,
  onSelectAgent,
  onStartVoiceCall,
}: PlaygroundTabProps) {
  const [testInput, setTestInput] = useState('Hello, how are you?');
  const [playgroundTests, setPlaygroundTests] = useState<PlaygroundTest[]>([]);
  const [playgroundTestActive, setPlaygroundTestActive] = useState(false);
  const [detectedInfo, setDetectedInfo] = useState<{ language: string; confidence: number; script: string } | null>(null);

  const {
    isRecording,
    volume,
    error: micError,
    startRecording,
    stopRecording,
  } = useAudioRecorder({
    onAudioChunk: (chunk) => {
      if (sendAudioChunk) {
        sendAudioChunk(chunk);
      }
    },
    onSpeechStart: () => {
      if (sendControl) {
        sendControl('start_speaking', {});
      }
    },
    onSpeechEnd: () => {
      if (sendControl) {
        sendControl('stop_speaking', {});
      }
    },
  });

  const handleInterrupt = useCallback(() => {
    if (sendControl) {
      sendControl('interrupt', {});
    }
    if (onStopAudio) {
      onStopAudio();
    }
  }, [sendControl, onStopAudio]);

  const displayTests = tests.length > 0 ? tests : playgroundTests;
  const isRunning = testActive || playgroundTestActive;

  const handleDetectLanguage = async (text: string) => {
    if (!text.trim()) return;
    try {
      const res = await fetch('/api/multilingual/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.success) {
        setDetectedInfo({ language: data.language, confidence: data.confidence, script: data.script });
      }
    } catch (err) {
      console.error('Detection error:', err);
    }
  };

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

          {onStartVoiceCall && (
            <button
              className="btn btn-primary"
              onClick={() => onStartVoiceCall(activeAgent)}
              style={{
                background: 'var(--studio-accent-strong)',
                border: 'none',
                color: 'var(--studio-text)',
                fontWeight: 700,
                fontSize: '0.85rem',
                padding: '0.55rem 1.1rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: '0 4px 14px rgba(var(--studio-success-rgb), 0.4)',
                cursor: 'pointer',
              }}
              title="Start two-way conversational voice call: Agent speaks first, listens to your mic, and answers aloud"
            >
              <span>📞</span>
              <span>Start Live Voice Call</span>
            </button>
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

      {/* Phase 8: Live Browser Audio Engine (Microphone & Web Audio API Stream) */}
      <div
        className="card"
        style={{
          gridColumn: '1 / -1',
          marginTop: '1.5rem',
          background: isRecording
            ? 'var(--studio-surface)'
            : 'var(--studio-surface)',
          border: isRecording ? '1px solid rgba(var(--studio-danger-rgb), 0.4)' : '1px solid rgba(var(--studio-success-rgb), 0.3)',
          boxShadow: isRecording
            ? '0 8px 32px rgba(var(--studio-danger-rgb), 0.15)'
            : '0 8px 32px rgba(var(--studio-success-rgb), 0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🎙️</span>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Live Browser Audio Engine
              </h3>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '999px',
                  background: isRecording ? 'rgba(var(--studio-danger-rgb), 0.2)' : 'rgba(var(--studio-success-rgb), 0.15)',
                  color: isRecording ? 'var(--studio-danger)' : 'var(--studio-success)',
                  border: isRecording ? '1px solid rgba(var(--studio-danger-rgb), 0.4)' : '1px solid rgba(var(--studio-success-rgb), 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isRecording ? 'var(--studio-danger)' : 'var(--studio-success)',
                    boxShadow: isRecording ? '0 0 8px var(--studio-danger)' : '0 0 8px var(--studio-success)',
                  }}
                />
                {isRecording ? 'STREAMING PCM16' : 'READY TO STREAM'}
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--studio-secondary)' }}>
              Live microphone capture downsampled to 16kHz PCM over binary WebSocket with Web Audio API chunk playback.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Live Mic Toggle Button */}
            <button
              type="button"
              id="liveMicStreamBtn"
              onClick={isRecording ? stopRecording : startRecording}
              style={{
                background: isRecording
                  ? 'var(--studio-danger-strong)'
                  : 'var(--studio-accent-strong)',
                color: 'var(--studio-text)',
                border: 'none',
                padding: '0.65rem 1.25rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.875rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                boxShadow: isRecording
                  ? '0 4px 18px rgba(var(--studio-danger-rgb), 0.4)'
                  : '0 4px 18px rgba(var(--studio-success-rgb), 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>{isRecording ? '⏹️' : '🎤'}</span>
              <span>{isRecording ? 'Stop Live Mic Stream' : 'Start Live Mic Stream'}</span>
            </button>

            {/* Barge-In Interruption Button */}
            <button
              type="button"
              id="bargeInBtn"
              onClick={handleInterrupt}
              style={{
                background: 'rgba(var(--studio-danger-rgb), 0.15)',
                color: 'var(--studio-danger)',
                border: '1px solid rgba(var(--studio-danger-rgb), 0.35)',
                padding: '0.65rem 1.1rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.875rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              title="Instantly stop agent speech output (Barge-In interruption)"
            >
              <span>⚡</span>
              <span>Interrupt Agent</span>
            </button>
          </div>
        </div>

        {/* Real-time VU Visualizer & Latency Metrics */}
        <div
          style={{
            background: 'rgba(var(--studio-base-rgb), 0.6)',
            borderRadius: '8px',
            padding: '0.85rem 1.15rem',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {/* Waveform VU Meter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--studio-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Mic Input Level:
            </span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '24px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((barIndex) => {
                const threshold = barIndex * 12;
                const active = volume >= threshold;
                const barHeight = active
                  ? Math.min(24, Math.max(6, Math.round((volume / 100) * 24 * (0.6 + (barIndex % 3) * 0.2))))
                  : 4;
                return (
                  <div
                    key={barIndex}
                    style={{
                      width: '6px',
                      height: `${barHeight}px`,
                      borderRadius: '2px',
                      background: active
                        ? barIndex > 6
                          ? 'var(--studio-danger)'
                          : barIndex > 4
                          ? 'var(--studio-warning)'
                          : 'var(--studio-success)'
                        : 'rgba(255, 255, 255, 0.12)',
                      transition: 'height 0.08s ease, background 0.08s ease',
                    }}
                  />
                );
              })}
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: isRecording ? 'var(--studio-accent)' : 'var(--studio-muted)',
                fontWeight: 600,
                minWidth: '38px',
              }}
            >
              {isRecording ? `${volume}%` : '0%'}
            </span>
          </div>

          {/* Engine Parameters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.75rem', color: 'var(--studio-secondary)' }}>
            <div>
              <span style={{ color: 'var(--studio-muted)' }}>STT Input: </span>
              <strong style={{ color: 'var(--studio-text)' }}>16 kHz PCM (Int16)</strong>
            </div>
            <div>
              <span style={{ color: 'var(--studio-muted)' }}>Audio Output: </span>
              <strong style={{ color: 'var(--studio-text)' }}>24 kHz Web Audio</strong>
            </div>
            <div>
              <span style={{ color: 'var(--studio-muted)' }}>Transport: </span>
              <strong style={{ color: 'var(--studio-success)' }}>Binary Frame (0x01)</strong>
            </div>
          </div>
        </div>

        {micError && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.6rem 0.9rem',
              borderRadius: '6px',
              background: 'rgba(var(--studio-danger-rgb), 0.12)',
              border: '1px solid rgba(var(--studio-danger-rgb), 0.3)',
              color: 'var(--studio-danger)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>⚠️</span>
            <span>Microphone access error: {micError}. Please ensure microphone permission is granted in your browser.</span>
          </div>
        )}
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
              rows={3}
              value={testInput}
              onChange={(e) => {
                setTestInput(e.target.value);
                setDetectedInfo(null);
              }}
            />

            {/* Quick Multi-Language Phrases */}
            <div style={{ marginTop: '0.4rem', marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.73rem', color: 'var(--studio-secondary)' }}>
                <span>🌐 Quick Bilingual Phrases:</span>
                {detectedInfo && (
                  <span style={{ color: 'var(--studio-success)', fontWeight: 600 }}>
                    Detected: {detectedInfo.language.toUpperCase()} ({Math.round(detectedInfo.confidence * 100)}% match)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                  onClick={() => {
                    const text = "Can you please check my hotel reservation for tomorrow?";
                    setTestInput(text);
                    handleDetectLanguage(text);
                  }}
                >
                  🇺🇸 English
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                  onClick={() => {
                    const text = "¡Hola! ¿Podrías consultar mi reserva de hotel para mañana por favor?";
                    setTestInput(text);
                    handleDetectLanguage(text);
                  }}
                >
                  🇪🇸 Spanish
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                  onClick={() => {
                    const text = "Bonjour ! Pouvez-vous vérifier ma réservation d'hôtel pour demain s'il vous plaît ?";
                    setTestInput(text);
                    handleDetectLanguage(text);
                  }}
                >
                  🇫🇷 French
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                  onClick={() => {
                    const text = "Guten Tag, können Sie meine Hotelbuchung für morgen bitte überprüfen?";
                    setTestInput(text);
                    handleDetectLanguage(text);
                  }}
                >
                  🇩🇪 German
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                  onClick={() => {
                    const text = "こんにちは、明日のホテルの予約を確認していただけますか？";
                    setTestInput(text);
                    handleDetectLanguage(text);
                  }}
                >
                  🇯🇵 Japanese
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                  onClick={() => {
                    const text = "नमस्ते, क्या आप कल के लिए मेरी होटल बुकिंग की पुष्टि कर सकते हैं?";
                    setTestInput(text);
                    handleDetectLanguage(text);
                  }}
                >
                  🇮🇳 Hindi
                </button>
              </div>
            </div>

            <div className="btn-group">
              <button className="btn btn-success" onClick={handleRunTest} disabled={isRunning}>
                {isRunning ? 'Running...' : 'Run Test'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleDetectLanguage(testInput)}
                title="Identify language and script dialect"
              >
                🔍 Detect Language
              </button>
              {onStartVoiceCall && activeAgent && (
                <button
                  className="btn btn-primary"
                  onClick={() => onStartVoiceCall(activeAgent)}
                  style={{ background: 'var(--studio-accent-strong)', border: 'none', color: 'var(--studio-text)', fontWeight: 600 }}
                  title="Start live voice call where agent speaks first, listens to you, and answers back"
                >
                  📞 Live Voice Call
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => { setPlaygroundTests([]); }}>Clear View</button>
            </div>
          </div>

          <div className="playground-panel">
            <h3>Test Output</h3>
            <div className="playground-output" id="testOutput">
              {displayTests.length === 0 ? (
                <div style={{ color: 'var(--studio-muted)', textAlign: 'center', padding: '2rem' }}>
                  No test run yet. Type a message and click "Run Test" above.
                </div>
              ) : (
                displayTests.map((test) => (
                  <div key={test.test_id} className="output-entry">
                    <div className="output-label">
                      {new Date(test.timestamp > 1e11 ? test.timestamp : test.timestamp * 1000).toLocaleTimeString()} - Test {test.test_id}
                      <span style={{
                        color: test.status === 'running' ? 'var(--studio-warning)' :
                               test.status === 'completed' ? 'var(--studio-success)' : 'var(--studio-danger)',
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
              <div style={{ color: 'var(--studio-muted)', textAlign: 'center', padding: '2rem' }}>
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

        {/* Phase 12: In-Call Calendar & Appointments Widget */}
        <div style={{ gridColumn: '1 / -1' }}>
          <CalendarWidget />
        </div>
      </div>
    </>
  );
}
