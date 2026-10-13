import type { TabName } from './types';

export const PAGE_ROUTES: Record<TabName, { path: string; title: string }> = {
  agents: { path: '/agents', title: 'Multi-Agent Studio' },
  campaigns: { path: '/campaigns', title: 'Outbound Campaigns' },
  knowledge: { path: '/knowledge', title: 'Knowledge & RAG' },
  evals: { path: '/evals', title: 'Evals & Test Suite' },
  hitl: { path: '/hitl', title: 'HITL Supervision' },
  playground: { path: '/playground', title: 'Interactive Voice Playground' },
  telephony: { path: '/telephony', title: 'PSTN Telephony & Real Phone Numbers' },
  analytics: { path: '/analytics', title: 'Call History & Post-Call QA Intelligence' },
  monitor: { path: '/monitor', title: 'Live System Telemetry' },
  inspector: { path: '/inspector', title: 'Conversation & Tool Inspector' },
};

export const PAGE_NAMES = Object.keys(PAGE_ROUTES) as TabName[];
