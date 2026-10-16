import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { PAGE_ROUTES } from '../../routes';
import type { TabName, Agent, DashboardState } from '../../types';
import { IconBot, IconFlask, IconBook, IconPhone, IconHistory, IconActivity, IconInspector, IconHeadphones, IconTarget, PersonaAvatar } from '../common/Icons';
import { StudioIcon } from '../common/StudioIcon';

interface SidebarProps {
  agents: Agent[];
  activeAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  onCreateAgent: () => void;
  connected: boolean;
  dashboardState: DashboardState;
  open: boolean;
  onClose: () => void;
}

const navigation = [
  { label: 'BUILD', items: [
    { id: 'agents', label: 'Voice agents', icon: IconBot },
    { id: 'knowledge', label: 'Knowledge base', icon: IconBook },
    { id: 'playground', label: 'Playground', icon: IconFlask },
    { id: 'evals', label: 'Evaluations', icon: IconTarget },
  ] },
  { label: 'OPERATE', items: [
    { id: 'campaigns', label: 'Campaigns', icon: IconTarget },
    { id: 'telephony', label: 'Phone numbers', icon: IconPhone },
    { id: 'hitl', label: 'Human handoff', icon: IconHeadphones },
  ] },
  { label: 'OBSERVE', items: [
    { id: 'analytics', label: 'Call history', icon: IconHistory },
    { id: 'monitor', label: 'Live monitor', icon: IconActivity },
    { id: 'inspector', label: 'Inspector', icon: IconInspector },
  ] },
];

export function Sidebar({ agents, activeAgent, onSelectAgent, onCreateAgent, connected, dashboardState, open, onClose }: SidebarProps) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('.sidebar-close')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') || []).filter(element => element.offsetParent !== null);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [open, onClose]);

  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" tabIndex={-1} onClick={onClose} />}
      <aside ref={panel} id="studio-sidebar" className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="studio-brand-mark"><StudioIcon name="voice" size={22} /></span>
          <div className="brand-info"><h2>VoiceAI<span>studio</span></h2></div>
          <button className="studio-icon-button sidebar-close" aria-label="Close navigation" onClick={onClose}><StudioIcon name="close" /></button>
        </div>
        <div className="workspace-card"><span className="workspace-avatar">W</span><div><strong>My workspace</strong><small>Voice agent platform</small></div></div>
        <div className="sidebar-scroll">
          {navigation.map(group => <div className="sidebar-section" key={group.label}>
            <div className="sidebar-section-title">{group.label}</div>
            <nav className="sidebar-nav" aria-label={group.label.toLowerCase()}>
              {group.items.map(({ id, label, icon: Icon }) => <NavLink key={id} to={PAGE_ROUTES[id as TabName].path} end onClick={onClose} className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}><span className="nav-icon"><Icon size={17} /></span><span className="nav-label">{label}</span>{id === 'agents' && <span className="nav-badge">{agents.length}</span>}</NavLink>)}
            </nav>
          </div>)}
          <div className="sidebar-section sidebar-agents-section">
            <div className="sidebar-section-header"><span className="sidebar-section-title">YOUR AGENTS</span><button className="studio-icon-button" title="Create agent" aria-label="Create agent" onClick={() => { onCreateAgent(); onClose(); }}><StudioIcon name="plus" size={15} /></button></div>
            <div className="sidebar-agents-list">{agents.map(agent => <button key={agent.id} className={`sidebar-agent-item ${activeAgent?.id === agent.id ? 'active' : ''}`} aria-pressed={activeAgent?.id === agent.id} onClick={() => { onSelectAgent(agent); onClose(); }}><PersonaAvatar name={agent.name} role={agent.role} size={25} /><span className="agent-meta"><span className="agent-name">{agent.name}</span></span>{activeAgent?.id === agent.id && <span className="agent-active-dot" aria-label="Selected">●</span>}</button>)}</div>
          </div>
        </div>
        <div className="sidebar-footer"><div className="connection-status"><span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`} /><div className="status-details"><span className="status-label">{connected ? 'Live connection ready' : 'Live connection offline'}</span><span className="status-sub">{dashboardState.session_id ? 'Session in progress' : 'Your next conversation starts here'}</span></div></div></div>
      </aside>
    </>
  );
}
