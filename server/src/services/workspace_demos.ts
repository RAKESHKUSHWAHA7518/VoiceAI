import { Request } from 'express';
import { CampaignManager } from './campaign';
import { HITLEngine } from './hitl';
import { EvalEngine } from './evals';
import { campaignManager } from './campaign';
import { hitlEngine } from './hitl';
import { evalEngine } from './evals';
import { legacyDemo, workspaceId } from '../middleware/workspace';

// Older showcase workflows are simulations. Never route them through shared account data.
const workspaces = new Map<string, { campaigns: CampaignManager; handoff: HITLEngine; evals: EvalEngine }>();
function engines(req: Request) {
  if (legacyDemo()) return { campaigns: campaignManager, handoff: hitlEngine, evals: evalEngine };
  const id = workspaceId(req); if (!id) throw new Error('Workspace required');
  let value = workspaces.get(id);
  if (!value) {
    if (workspaces.size >= 100) throw new Error('Demo workspace capacity reached');
    value = { campaigns: new CampaignManager(), handoff: new HITLEngine(), evals: new EvalEngine() };
    workspaces.set(id, value);
  }
  return value;
}
export const workspaceCampaigns = (req: Request) => engines(req).campaigns;
export const workspaceHandoff = (req: Request) => engines(req).handoff;
export const workspaceEvals = (req: Request) => engines(req).evals;
