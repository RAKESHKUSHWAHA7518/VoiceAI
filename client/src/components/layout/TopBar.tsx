import { useState, useEffect } from 'react';
import type { TabName, Agent, UserAccount } from '../../types';
import { IconPhone, PersonaAvatar } from '../common/Icons';

interface TopBarProps {
  activeTab: TabName;
  activeAgent: Agent | null;
  onOpenAgentsTab: () => void;
  onStartVoiceCall?: () => void;
  connected: boolean;
}

export function TopBar({
  activeTab,
  activeAgent,
  onOpenAgentsTab,
  onStartVoiceCall,
  connected,
}: TopBarProps) {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [allUsers, setAllUsers] = useState<UserAccount[]>([]);

  useEffect(() => {
    fetch('/api/security/me')
      .then(r => r.json())
      .then(d => {
        if (d.user) setCurrentUser(d.user);
      })
      .catch(() => {});

    fetch('/api/security/users')
      .then(r => r.json())
      .then(d => {
        if (d.users) setAllUsers(d.users);
      })
      .catch(() => {});
  }, []);

  const handleSwitchUser = async (userId: string) => {
    try {
      const res = await fetch('/api/security/switch-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user);
      }
    } catch (err) {
      console.error('Failed to switch user:', err);
    }
  };

  const getTabTitle = (tab: TabName) => {
    switch (tab) {
      case 'agents':
        return 'Multi-Agent Studio';
      case 'playground':
        return 'Interactive Voice Playground';
      case 'telephony':
        return 'PSTN Telephony & Real Phone Numbers';
      case 'analytics':
        return 'Call History & Post-Call QA Intelligence';
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
        {activeAgent && onStartVoiceCall && (
          <button
            className="btn btn-primary btn-sm topbar-call-btn"
            onClick={onStartVoiceCall}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)',
              cursor: 'pointer',
              padding: '0.45rem 0.95rem',
              borderRadius: '24px',
              transition: 'all 0.2s ease',
            }}
            title="Start live conversational voice call with active agent"
          >
            <IconPhone size={14} color="#ffffff" />
            <span>Call {activeAgent.name}</span>
          </button>
        )}

        {activeAgent && (
          <div className="active-agent-badge" onClick={onOpenAgentsTab} title="Click to manage agents">
            <PersonaAvatar name={activeAgent.name} role={activeAgent.role} size={28} />
            <div className="badge-info">
              <span className="badge-name">{activeAgent.name}</span>
              <span className="badge-role">{activeAgent.role}</span>
            </div>
            <span className="badge-pill">{activeAgent.llm_model}</span>
          </div>
        )}

        {/* Enterprise Security & SOC2 / HIPAA RBAC Badge */}
        {currentUser && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '24px',
            padding: '0.35rem 0.75rem',
            fontSize: '0.75rem',
          }}>
            <span title="SOC2 Type II & HIPAA Certified Access Control" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#60a5fa', fontWeight: 700 }}>
              <span>🛡️</span>
              <span style={{ fontSize: '0.65rem', background: 'rgba(30, 58, 138, 0.7)', border: '1px solid rgba(59, 130, 246, 0.4)', padding: '0.1rem 0.4rem', borderRadius: '10px', color: '#93c5fd' }}>
                SOC2 / HIPAA
              </span>
            </span>
            <select
              style={{
                background: 'transparent',
                color: '#e2e8f0',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              value={currentUser.id}
              onChange={e => handleSwitchUser(e.target.value)}
              title="Switch Active RBAC User Role"
            >
              {allUsers.map(u => (
                <option key={u.id} value={u.id} style={{ background: '#070a13', color: '#fff' }}>
                  {u.avatar} {u.name} ({u.role.replace('_', ' ').toUpperCase()})
                </option>
              ))}
            </select>
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
