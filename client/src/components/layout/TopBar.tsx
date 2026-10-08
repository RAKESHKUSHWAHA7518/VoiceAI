// ============================================================================
// TopBar Component
// ============================================================================

import type { TabName, Agent } from '../../types';

interface TopBarProps {
  activeTab: TabName;
  activeAgent: Agent | null;
  onOpenAgentsTab: () => void;
  connected: boolean;
}

export function TopBar({
  activeTab,
  activeAgent,
  onOpenAgentsTab,
  connected,
}: TopBarProps) {
  const getTabTitle = (tab: TabName) => {
    switch (tab) {
      case 'agents':
        return 'Multi-Agent Studio';
      case 'playground':
        return 'Interactive Voice Playground';
      case 'monitor':
        return 'Live System Telemetry';
      case 'inspector':
        return 'Conversation & Tool Inspector';
      default:
        return 'Dashboard';
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{getTabTitle(activeTab)}</h1>
      </div>

      <div className="topbar-right">
        {activeAgent && (
          <div className="active-agent-badge" onClick={onOpenAgentsTab} title="Click to manage agents">
            <span className="badge-avatar">{activeAgent.avatar || '🤖'}</span>
            <div className="badge-info">
              <span className="badge-name">{activeAgent.name}</span>
              <span className="badge-role">{activeAgent.role}</span>
            </div>
            <span className="badge-pill">{activeAgent.llm_model}</span>
          </div>
        )}

        <div className="topbar-status">
          <span className={`status-dot ${connected ? '' : 'disconnected'}`}></span>
          <span className="topbar-status-text">{connected ? 'Connected' : 'Offline'}</span>
        </div>
      </div>
    </header>
  );
}
