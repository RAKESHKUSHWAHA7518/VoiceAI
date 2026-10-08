// ============================================================================
// Monitor Tab Component
// ============================================================================

import { useRef, useEffect } from 'react';
import type { MetricsData, TranscriptMsg, BargeInEvent, ToolCall } from '../../types';

interface MonitorTabProps {
  metrics: MetricsData;
  transcripts: TranscriptMsg[];
  bargeInEvents: BargeInEvent[];
  toolCalls: ToolCall[];
  audioLevelUser: number[];
  audioLevelAgent: number[];
}

export function MonitorTab({
  metrics,
  transcripts,
  bargeInEvents,
  toolCalls,
  audioLevelUser,
  audioLevelAgent,
}: MonitorTabProps) {
  const canvasUserRef = useRef<HTMLCanvasElement>(null);
  const canvasAgentRef = useRef<HTMLCanvasElement>(null);

  // Live waveform animation
  useEffect(() => {
    const animate = () => {
      const canvasUser = canvasUserRef.current;
      const canvasAgent = canvasAgentRef.current;
      if (!canvasUser || !canvasAgent) return;

      const drawWaveform = (canvas: HTMLCanvasElement, buffer: number[], color: string) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        const step = canvas.width / Math.max(buffer.length, 1);
        buffer.forEach((val, i) => {
          const x = i * step;
          const y = canvas.height / 2 - val * canvas.height / 3;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };

      drawWaveform(canvasUser, audioLevelUser, '#60a5fa');
      drawWaveform(canvasAgent, audioLevelAgent, '#4ade80');
      requestAnimationFrame(animate);
    };

    animate();
  }, [audioLevelUser, audioLevelAgent]);

  const getMetricClass = (value: number | undefined, warningThreshold: number, dangerThreshold: number) => {
    if (!value) return 'ok';
    if (value > dangerThreshold) return 'danger';
    if (value > warningThreshold) return 'warning';
    return 'ok';
  };

  const metricRows = [
    { label: 'VAD', value: metrics.vad_p50, warning: 50, danger: 100 },
    { label: 'ASR', value: metrics.asr_p50, warning: 200, danger: 500 },
    { label: 'TTFT (LLM)', value: metrics.ttft_p50, warning: 200, danger: 500 },
    { label: 'TTS First Chunk', value: metrics.tts_first_chunk_p50, warning: 100, danger: 300 },
    { label: 'E2E', value: metrics.e2e_p50, warning: 300, danger: 500 },
  ];

  const percentileItems = [
    { label: 'VAD P50', value: metrics.vad_p50 },
    { label: 'VAD P95', value: metrics.vad_p95 },
    { label: 'ASR P50', value: metrics.asr_p50 },
    { label: 'ASR P95', value: metrics.asr_p95 },
    { label: 'TTFT P50', value: metrics.ttft_p50 },
    { label: 'TTFT P95', value: metrics.ttft_p95 },
    { label: 'E2E P50', value: metrics.e2e_p50 },
    { label: 'E2E P95', value: metrics.e2e_p95 },
  ];

  return (
    <div className="grid">
      {/* Audio Waveforms */}
      <div className="card">
        <h2>Audio Waveforms</h2>
        <div className="waveform-container">
          <canvas id="waveformUser" ref={canvasUserRef} className="waveform-canvas" />
          <canvas id="waveformAgent" ref={canvasAgentRef} className="waveform-canvas" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.7 }} />
        </div>
        <div className="waveform-labels">
          <span>👤 User</span>
          <span>🤖 Agent</span>
        </div>
      </div>

      {/* Live Metrics */}
      <div className="card">
        <h2>Live Latency Metrics</h2>
        <div id="liveMetrics">
          {metricRows.map(({ label, value, warning, danger }) => (
            <div key={label} className="metric-row">
              <span className="metric-label">{label}</span>
              <span className={`metric-value ${getMetricClass(value, warning, danger)}`}>
                {value ? `${value.toFixed(1)}ms` : '-'}
              </span>
            </div>
          ))}
          <div className="metric-row">
            <span className="metric-label">Interruptions</span>
            <span className="metric-value" id="interruptCount">{bargeInEvents.length}</span>
          </div>
        </div>
      </div>

      {/* Percentiles */}
      <div className="card">
        <h2>Percentiles (Last 1000 Turns)</h2>
        <div className="percentile-grid">
          {percentileItems.map(({ label, value }) => (
            <div key={label} className="percentile-item">
              <div className="percentile-label">{label}</div>
              <div className="percentile-value">{value ? `${value.toFixed(1)}ms` : '-'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Transcript */}
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Live Transcript</h2>
        <div className="transcript-list" id="transcriptList">
          {transcripts.length === 0 ? (
            <div className="transcript-item" style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
              No transcript yet. Start speaking...
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
        <div id="bargeInList" style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {bargeInEvents.length === 0 ? (
            <div style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>No barge-in events</div>
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
        <h2>Tool Calls</h2>
        <div id="toolCallList" style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {toolCalls.length === 0 ? (
            <div style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>No tool calls yet</div>
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
    </div>
  );
}