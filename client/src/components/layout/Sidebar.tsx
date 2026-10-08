// ============================================================================
// Modern Sidebar Navigation Component
// ============================================================================

import type { TabName, Agent, DashboardState } from '../../types';

interface SidebarProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  agents: Agent[];
  activeAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  onCreateAgent: () => void;
  connected: boolean;
  dashboardState: DashboardState;
}

export function Sidebar({
  activeTab,
  onTabChange,
  agents,
  activeAgent,
  onSelectAgent,
  onCreateAgent,
  connected,
  dashboardState,
}: SidebarProps) {
  const navItems: { id: TabName; label: string; icon: string; badge?: string }[] = [
    { id: 'agents', label: 'Agents Studio', icon: '🤖', badge: `${agents.length}` },
    { id: 'playground', label: 'Playground', icon: '🧪' },
    { id: 'analytics', label: 'Call History & QA', icon: '📋' },
    { id: 'monitor', label: 'Live Monitor', icon: '📊' },
    { id: 'inspector', label: 'Inspector & Tools', icon: '🔍' },
  ];

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-icon">🎙️</div>
        <div className="brand-info">
          <h2>VoiceAI</h2>
          <span className="brand-subtitle">Agent Studio</span>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Navigation</div>
        <nav className="sidebar-nav">
          {navItems.map(({ id, label, icon, badge }) => (
            <button
              key={id}
              className={`sidebar-nav-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => onTabChange(id)}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
              {badge && <span className="nav-badge">{badge}</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* Agents Quick Switcher */}
      <div className="sidebar-section sidebar-agents-section">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">Active Agents</span>
          <button
            className="sidebar-action-btn"
            title="Create New Agent"
            onClick={onCreateAgent}
          >
            + New
          </button>
        </div>

        <div className="sidebar-agents-list">
          {agents.map((agent) => {
            const isSelected = activeAgent?.id === agent.id;
            return (
              <div
                key={agent.id}
                className={`sidebar-agent-item ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectAgent(agent)}
              >
                <span className="agent-avatar">{agent.avatar || '🤖'}</span>
                <div className="agent-meta">
                  <div className="agent-name">{agent.name}</div>
                  <div className="agent-role">{agent.role}</div>
                </div>
                {isSelected && <span className="agent-active-dot" title="Active Agent">●</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        <div className="connection-status">
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}></span>
          <div className="status-details">
            <span className="status-label">{connected ? 'WebSocket Live' : 'Offline'}</span>
            <span className="status-sub">
              {dashboardState.session_id ? `Session: ${dashboardState.session_id.substring(0, 8)}...` : 'Port 8000/ws'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
