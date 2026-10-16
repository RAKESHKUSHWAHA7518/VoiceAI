import { useState, useEffect } from 'react';
import { StudioIcon } from '../common/StudioIcon';
import { PAGE_ROUTES } from '../../routes';
import type { TabName, Agent, UserAccount } from '../../types';
import { IconPhone, PersonaAvatar } from '../common/Icons';

interface TopBarProps {
  activeTab: TabName | null;
  activeAgent: Agent | null;
  onOpenAgentsTab: () => void;
  onStartVoiceCall?: () => void;
  connected: boolean;
  onToggleNavigation: () => void;
  navigationOpen: boolean;
}

export function TopBar({
  activeTab,
  activeAgent,
  onOpenAgentsTab,
  onStartVoiceCall,
  connected,
  onToggleNavigation,
  navigationOpen,
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

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button id="navigation-toggle" className="studio-icon-button mobile-menu-button" onClick={onToggleNavigation} aria-label="Open navigation" aria-controls="studio-sidebar" aria-expanded={navigationOpen}><StudioIcon name="menu" /></button>
        <span className="workspace-crumb">Workspace</span><span className="crumb-divider">/</span>
        <h1 className="topbar-title">{activeTab ? PAGE_ROUTES[activeTab].title : 'Page not found'}</h1>
      </div>
      <div className="topbar-right">
        <div className={connected ? 'studio-connection is-connected' : 'studio-connection'} title={connected ? 'Live connection established' : 'Live connection unavailable'}>
          <span />{connected ? 'Connected' : 'Disconnected'}
        </div>
        {activeAgent && <button className="studio-agent-switch" onClick={onOpenAgentsTab} title="Manage selected agent"><PersonaAvatar name={activeAgent.name} role={activeAgent.role} size={26} /><span>{activeAgent.name}</span></button>}
        {activeAgent && onStartVoiceCall && <button className="btn btn-primary topbar-call-btn" onClick={onStartVoiceCall}><IconPhone size={15} /><span>Test call</span></button>}
        {currentUser && <label className="studio-user-select"><span className="sr-only">Switch workspace user</span><select value={currentUser.id} onChange={e => handleSwitchUser(e.target.value)}>{allUsers.map(user => <option key={user.id} value={user.id}>{user.name} · {user.role.replace(/_/g, ' ')}</option>)}</select></label>}
      </div>
    </header>
  );
}
