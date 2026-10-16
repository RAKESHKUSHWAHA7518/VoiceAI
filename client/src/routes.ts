import type { TabName } from './types';

export const PAGE_ROUTES: Record<TabName, { path: string; title: string }> = {
  agents: { path: '/agents', title: 'Voice agents' },
  campaigns: { path: '/campaigns', title: 'Outbound Campaigns' },
  knowledge: { path: '/knowledge', title: 'Knowledge base' },
  evals: { path: '/evals', title: 'Evaluations' },
  hitl: { path: '/hitl', title: 'Human handoff' },
  playground: { path: '/playground', title: 'Playground' },
  telephony: { path: '/telephony', title: 'Phone numbers' },
  analytics: { path: '/analytics', title: 'Call history' },
  monitor: { path: '/monitor', title: 'Live monitor' },
  inspector: { path: '/inspector', title: 'Inspector' },
};

export const PAGE_NAMES = Object.keys(PAGE_ROUTES) as TabName[];
