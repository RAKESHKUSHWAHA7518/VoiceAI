import { useState } from 'react';
import { StudioIcon } from '../common/StudioIcon';
import { PAGE_ROUTES } from '../../routes';
import type { TabName, Agent } from '../../types';
import { IconMic, PersonaAvatar } from '../common/Icons';
import { useAccount } from '../auth/AuthGate';
interface TopBarProps {
  activeTab: TabName | null; activeAgent: Agent | null;
  onOpenAgentsTab: () => void; onStartVoiceCall?: () => void;
  connected: boolean; onToggleNavigation: () => void; navigationOpen: boolean;
}
export function TopBar({ activeTab, activeAgent, onOpenAgentsTab, onStartVoiceCall, onToggleNavigation, navigationOpen }: TopBarProps) {
  const { user, logout } = useAccount();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <header className="topbar">
    <div className="topbar-left">
      <button id="navigation-toggle" className="studio-icon-button mobile-menu-button" onClick={onToggleNavigation} aria-label="Open navigation" aria-controls="studio-sidebar" aria-expanded={navigationOpen}><StudioIcon name="menu" /></button>
      <span className="workspace-crumb">My workspace</span><span className="crumb-divider">/</span>
      <h1 className="topbar-title">{activeTab ? PAGE_ROUTES[activeTab].title : 'Page not found'}</h1>
    </div>
    <div className="topbar-right">
      {activeAgent && <button className="studio-agent-switch" onClick={onOpenAgentsTab} title="Manage selected agent"><PersonaAvatar name={activeAgent.name} role={activeAgent.role} size={26} /><span>{activeAgent.name}</span></button>}
      {activeAgent && onStartVoiceCall && <button className="btn btn-primary topbar-call-btn" onClick={onStartVoiceCall}><IconMic size={15} /><span>Talk to agent</span></button>}
      <div className="workspace-account"><span>{user?.name}</span><button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await logout(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign out'); } finally { setBusy(false); } }}>{busy ? 'Signing out...' : 'Sign out'}</button></div>
      {error && <span role="alert">{error}</span>}
    </div>
  </header>;
}
