// ============================================================================
// Modern Sidebar Navigation Component
// Enterprise logo & SVG navigation icons (no emojis)
// ============================================================================

import React from 'react';
import { NavLink } from 'react-router-dom';
import { PAGE_ROUTES } from '../../routes';
import type { TabName, Agent, DashboardState } from '../../types';
import {
  LogoVoiceAI,
  IconBot,
  IconFlask,
  IconBook,
  IconPhone,
  IconHistory,
  IconActivity,
  IconInspector,
  IconHeadphones,
  IconTarget,
  PersonaAvatar,
} from '../common/Icons';

interface SidebarProps {
  agents: Agent[];
  activeAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  onCreateAgent: () => void;
  connected: boolean;
  dashboardState: DashboardState;
}

export function Sidebar({
  agents,
  activeAgent,
  onSelectAgent,
  onCreateAgent,
  connected,
  dashboardState,
}: SidebarProps) {
  const navItems: { id: TabName; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'agents', label: 'Agents Studio', icon: <IconBot size={18} />, badge: `${agents.length}` },
    { id: 'campaigns', label: 'Outbound Campaigns', icon: <IconPhone size={18} />, badge: 'NEW' },
    { id: 'knowledge', label: 'Knowledge & RAG', icon: <IconBook size={18} /> },
    { id: 'evals', label: 'Evals & Test Suite', icon: <IconTarget size={18} /> },
    { id: 'hitl', label: 'HITL Supervision', icon: <IconHeadphones size={18} />, badge: 'LIVE' },
    { id: 'playground', label: 'Playground', icon: <IconFlask size={18} /> },
    { id: 'telephony', label: 'Telephony & Lines', icon: <IconPhone size={18} /> },
    { id: 'analytics', label: 'Call History & QA', icon: <IconHistory size={18} /> },
    { id: 'monitor', label: 'Live Monitor', icon: <IconActivity size={18} /> },
    { id: 'inspector', label: 'Inspector & Tools', icon: <IconInspector size={18} /> },
  ];

  return (
    <aside className="sidebar">
      {/* Brand Header with Vector Logo */}
      <div className="sidebar-brand">
        <div className="brand-icon-wrap" style={{ display: 'flex', alignItems: 'center' }}>
          <LogoVoiceAI size={38} />
        </div>
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
            <NavLink
              key={id}
              to={PAGE_ROUTES[id].path}
              end
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon" style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
              <span className="nav-label">{label}</span>
              {badge && <span className="nav-badge">{badge}</span>}
            </NavLink>
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
                <PersonaAvatar name={agent.name} role={agent.role} size={28} />
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
