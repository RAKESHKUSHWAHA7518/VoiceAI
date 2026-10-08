// ============================================================================
// Header Component
// ============================================================================

import type { DashboardState } from '../../types';

interface HeaderProps {
  connected: boolean;
  dashboardState: DashboardState;
}

export function Header({ connected, dashboardState }: HeaderProps) {
  return (
    <header className="header">
      <h1>VoiceAI Dashboard</h1>
      <div className="status">
        <span className={`status-dot ${connected ? '' : 'disconnected'}`}></span>
        <span id="statusText">{connected ? 'Connected' : 'Disconnected'}</span>
        <span id="sessionInfo">
          {dashboardState.session_id ? `Session: ${dashboardState.session_id}` : ''}
        </span>
      </div>
    </header>
  );
}