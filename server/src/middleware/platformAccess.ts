import { Request, Response, NextFunction } from 'express';
import { legacyDemo, requireWorkspace, sameOrigin, workspaceId } from './workspace';
import { getAgentById, ownsAgent } from '../routes/agents';
import { createDemoTools } from '../services/tools';
import { voiceLibraryManager } from '../services/voice_library';

export function platformAccess(req: Request, res: Response, next: NextFunction) {
  if (legacyDemo()) return next();
  requireWorkspace(req, res, error => {
    if (error) return next(error);
    sameOrigin(req, res, () => {
      const route = req.path.replace(/\/$/, '');
      if (route === '/platform') return res.json({ success: true, workspace_id: workspaceId(req), enabled_pages: ['agents', 'knowledge', 'playground', 'analytics', 'campaigns', 'telephony', 'evals', 'hitl', 'monitor', 'inspector', 'calendar', 'reports', 'features'], simulation_pages: ['campaigns', 'evals', 'hitl'] });
      if (/^\/(campaigns|evals|hitl)(\/|$)/.test(route)) {
        if (req.body?.agent_id && !ownsAgent(req, req.body.agent_id)) return res.status(404).json({ success: false, error: { message: 'Agent not found' } });
        res.set('X-VoiceAI-Mode', 'workspace-simulation');
        return next();
      }
      if (route.startsWith('/workspace-tools')) return next();
      if (/^\/calendar\/(slots|appointments(?:\/[^/]+)?|book)$/.test(route)) return next();
      if (/^\/telephony\/(numbers(?:\/[^/]+)?|outbound|simulate-inbound|softphone\/(dial|dtmf|hangup))$/.test(route)) {
        if (req.body?.agent_id && !ownsAgent(req, req.body.agent_id)) return res.status(404).json({ success: false, error: 'Agent not found' });
        return next();
      }
      if (route === '/tools' && req.method === 'GET') return res.json({ success: true, tools: Array.from(createDemoTools().values()).map(tool => ({ name: tool.name, label: tool.name, description: tool.description, parameters: tool.parameters, execution_type: 'mock' })) });
      if (route === '/voices' && req.method === 'GET') return res.json({ success: true, voices: voiceLibraryManager.getAllVoices().filter(voice => voice.provider !== 'custom_clone' && !voice.is_cloned) });
      if (route.startsWith('/agents')) return next();
      if (route.startsWith('/conversations')) return next();
      if (route.startsWith('/knowledge') && route !== '/knowledge/seed') return next();
      if (route === '/playground/test' && req.method === 'POST') {
        const id = req.body.agent_id;
        if (typeof id !== 'string' || !ownsAgent(req, id)) return res.status(404).json({ success: false, error: { message: 'Agent not found' } });
        const agent = getAgentById(id)!;
        // The database configuration is authoritative, never the caller's tool list.
        req.body = { ...req.body, ...agent, agent_id: agent.id, agent_name: agent.name };
        return next();
      }
      if (route === '/playground/speak' && req.method === 'POST') {
        if (!ownsAgent(req, req.body.agent_id)) return res.status(404).json({ success: false, error: { message: 'Agent not found' } });
        if (typeof req.body.text !== 'string' || req.body.text.length > 2000) return res.status(400).json({ success: false, error: { message: 'Speech text must contain at most 2000 characters' } });
        req.body.voice_id = getAgentById(req.body.agent_id)!.voice_id;
        return next();
      }
      return res.status(503).json({ success: false, error: { code: 'FEATURE_NOT_READY', message: 'This feature is not available in private workspaces yet.' } });
    });
  });
}

