// ============================================================================
// Tabs Component
// ============================================================================

import type { TabName } from '../../types';

interface TabsProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
}

export function Tabs({ activeTab, onTabChange }: TabsProps) {
  const tabs: { id: TabName; label: string; icon: string }[] = [
    { id: 'monitor', label: 'Monitor', icon: '📊' },
    { id: 'playground', label: 'Playground', icon: '🧪' },
    { id: 'inspector', label: 'Inspector', icon: '🔍' },
  ];

  return (
    <nav className="tabs">
      {tabs.map(({ id, label, icon }) => (
        <button
          key={id}
          className={`tab ${activeTab === id ? 'active' : ''}`}
          onClick={() => onTabChange(id)}
        >
          {icon} {label}
        </button>
      ))}
    </nav>
  );
}