// ============================================================================
// Inspector Tab Component
// ============================================================================

import type { TranscriptMsg, BargeInEvent, ToolCall } from '../../types';

interface InspectorTabProps {
  transcripts: TranscriptMsg[];
  bargeInEvents: BargeInEvent[];
  toolCalls: ToolCall[];
}

export function InspectorTab({ transcripts, bargeInEvents, toolCalls }: InspectorTabProps) {
  return (
    <div className="grid">
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

      {/* Session Metrics */}
      <div className="card">
        <h2>Session Metrics Detail</h2>
        <div className="percentile-grid" id="detailPercentileGrid">
          <div className="percentile-item">
            <div className="percentile-label">VAD P50</div>
            <div className="percentile-value">-</div>
          </div>
          <div className="percentile-item">
            <div className="percentile-label">VAD P95</div>
            <div className="percentile-value">-</div>
          </div>
          <div className="percentile-item">
            <div className="percentile-label">ASR P50</div>
            <div className="percentile-value">-</div>
          </div>
          <div className="percentile-item">
            <div className="percentile-label">ASR P95</div>
            <div className="percentile-value">-</div>
          </div>
          <div className="percentile-item">
            <div className="percentile-label">TTFT P50</div>
            <div className="percentile-value">-</div>
          </div>
          <div className="percentile-item">
            <div className="percentile-label">TTFT P95</div>
            <div className="percentile-value">-</div>
          </div>
          <div className="percentile-item">
            <div className="percentile-label">E2E P50</div>
            <div className="percentile-value">-</div>
          </div>
          <div className="percentile-item">
            <div className="percentile-label">E2E P95</div>
            <div className="percentile-value">-</div>
          </div>
        </div>
      </div>
    </div>
  );
}