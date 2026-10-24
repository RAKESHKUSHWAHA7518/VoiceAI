import { dataPath } from '../config/storage';
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AgentRecordModel } from '../models/agent.model';
import { PersistentStore } from '../services/database';
import { workspaceId } from '../middleware/workspace';
import { markWorkspaceInitialized, workspaceNeedsTemplates } from '../services/accounts';
import { publishAgent, listAgentDeployments, createDeployment, disableDeployment, disableAgentDeployments } from '../services/deployments';
import { closeAgentConversations } from '../services/conversations';
import { historyForWorkspace } from '../services/conversation_history';

export interface AgentModel {
  id: string;
  workspace_id?: string;
  name: string;
  role: string;
  avatar: string;
  voice_id: string;
  voice_name?: string;
  llm_model: string;
  llm_temperature: number;
  system_prompt: string;
  assigned_tools: string[];
  greeting: string;
  is_default?: boolean;
  languages_supported?: string[];
  default_language?: string;
  auto_switch_language?: boolean;
}

const defaultAgents: AgentModel[] = [
  {
    id: 'agent_support',
    name: 'Maya',
    role: 'Customer Support Lead',
    avatar: '🎧',
    voice_id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    voice_name: 'Friendly Assistant (Sonic 3.6)',
    llm_model: 'gpt-4o-mini',
    llm_temperature: 0.3,
    system_prompt: "You are Maya, a professional and empathetic Customer Support Lead.\n\nCRITICAL DOMAIN SCOPE RULE:\n- You must ONLY assist with customer support, orders, returns, account questions, and service issues.\n- You must strictly REFUSE to discuss any unrelated topics such as coding, math, weather forecasts, politics, recipes, general trivia, science, or general chit-chat.\n- If a user asks about anything outside customer support (for example, weather, coding, or trivia), politely decline and redirect: \"I am Maya, your customer support specialist. I can only assist you with your customer support, account, and order inquiries. How can I help you with your order or support request today?\"\n- Never answer off-topic questions under any circumstance.\n- Speak warmly and concisely in spoken-language sentences. No markdown.",
    assigned_tools: ['check_booking', 'transfer_call', 'transfer_to_human'],
    greeting: "Hello! I'm Maya, your customer support specialist. How can I help you today?",
    is_default: true,
    languages_supported: ['en', 'es', 'fr', 'de'],
    default_language: 'en',
    auto_switch_language: true,
  },
  {
    id: 'agent_weather',
    name: 'Alex',
    role: 'Concierge & Weather Specialist',
    avatar: '🌤️',
    voice_id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    voice_name: 'Crisp Informational',
    llm_model: 'gemini/gemini-3.5-flash',
    llm_temperature: 0.2,
    system_prompt: "You are Alex, an upbeat travel concierge and live weather specialist.\n\nCRITICAL DOMAIN SCOPE RULE:\n- You must ONLY talk about live weather forecasts, climate, current weather conditions, and city concierge travel advice.\n- When the user asks for the weather in any city or location, ALWAYS call the get_weather tool to fetch real live data, and report the temperature and condition clearly.\n- You must strictly REFUSE to discuss any unrelated topics such as programming, coding, math, general trivia, customer support orders, medical issues, politics, or homework.\n- If a user asks about anything outside weather or travel concierge (for example, writing code, customer orders, or math), politely decline and redirect: \"I am Alex, your weather and travel concierge. I only provide weather updates and city travel guidance. Which city's weather would you like me to check?\"\n- Never answer off-topic questions under any circumstance.\n- Speak in brief, natural spoken sentences. No markdown.",
    assigned_tools: ['get_weather'],
    greeting: "Hi there! I'm Alex, your concierge and weather guide. What city or forecast can I look up for you?",
    is_default: true,
  },
  {
    id: 'agent_hotel',
    name: 'Elena',
    role: 'Hospitality & Reservations',
    avatar: '🏨',
    voice_id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    voice_name: 'Warm Hospitality',
    llm_model: 'gemini/gemini-3.5-flash',
    llm_temperature: 0.3,
    system_prompt: "You are Elena, a 5-star hotel front desk and hospitality reservations specialist.\n\nCRITICAL DOMAIN SCOPE RULE:\n- You must ONLY assist with hotel room bookings, suite reservations, hotel amenities, check-in policies, and hotel dining reservations.\n- You must strictly REFUSE to discuss any unrelated topics such as coding, math, general world weather, politics, recipes, general trivia, or sports.\n- If a user asks about anything outside hotel reservations and hospitality (for example, weather in a distant city, programming, or trivia), politely decline and redirect: \"I am Elena from hospitality reservations. I can only assist with hotel room bookings, reservations, and stay amenities. Would you like to check room availability or make a reservation?\"\n- Never answer off-topic questions under any circumstance.\n- Speak with warm, elegant hospitality in concise spoken sentences. No markdown.",
    assigned_tools: ['check_booking', 'check_availability', 'book_appointment'],
    greeting: "Good day! I am Elena from hospitality reservations. How may I assist with your stay or dining today?",
    is_default: true,
  },
  {
    id: 'agent_medical',
    name: 'Dr. Marcus',
    role: 'Clinic Receptionist & Triage',
    avatar: '🩺',
    voice_id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    voice_name: 'Calm & Professional',
    llm_model: 'gpt-4o',
    llm_temperature: 0.2,
    system_prompt: 'You are Dr. Marcus, a calm and clinical medical receptionist. Help patients check appointment status, verify bookings, or transfer to the emergency nurse line.',
    assigned_tools: ['check_booking', 'transfer_call'],
    greeting: "Hello, this is Dr. Marcus at the clinic desk. How may I assist you with your appointment or health inquiry today?",
    is_default: true,
  },
];

const agentsFile = dataPath('agents.json');
// An existing empty file means the user deleted every agent. Never reseed it.
let agents: AgentModel[] = fs.existsSync(agentsFile)
  ? JSON.parse(fs.readFileSync(agentsFile, 'utf8')).map((value: unknown) => AgentRecordModel.parse(value))
  : defaultAgents.slice(0, 2);
const agentsStore = new PersistentStore(AgentRecordModel, agentsFile, () => agents, records => { agents = records; });

export function getAgentById(id: string): AgentModel | undefined {
  return agents.find(agent => agent.id === id);
}
export function ownsAgent(req: Request, id: string): boolean {
  const workspace = workspaceId(req);
  return !!getAgentById(id) && (!workspace || getAgentById(id)?.workspace_id === workspace);
}
function visibleAgents(req: Request) { return agents.filter(agent => !workspaceId(req) || agent.workspace_id === workspaceId(req)); }

// Serialize edits so a failed save cannot roll back another request's changes.
let pendingEdit: Promise<unknown> = Promise.resolve();
function editAgents(edit: () => void): Promise<void> {
  const operation = pendingEdit.then(async () => {
    const previous = agents.map(agent => ({ ...agent }));
    try {
      edit();
      await agentsStore.save();
    } catch (error) {
      agents = previous;
      throw error;
    }
  });
  pendingEdit = operation.catch(() => undefined);
  return operation;
}

const router = Router();

router.get('/readiness', (req, res) => {
  const workspace = workspaceId(req);
  const history = workspace ? historyForWorkspace(workspace) : [];
  const readiness = visibleAgents(req).map(agent => {
    const documents = ragEngine.listDocuments(agent.id);
    const indexed = documents.filter(doc => doc.status === 'indexed');
    const published = workspace ? listAgentDeployments(agent.id, workspace) : { versions: [], deployments: [] };
    const widget = published.deployments.filter(deployment => deployment.active).at(-1);
    const latest = published.versions.find(version => version.id === widget?.version_id) || published.versions.at(-1);
    const fields = ['name', 'role', 'voice_id', 'llm_model', 'llm_temperature', 'system_prompt', 'assigned_tools', 'greeting', 'languages_supported', 'default_language', 'auto_switch_language'] as const;
    const draftChanged = !!latest && fields.some(field => JSON.stringify(agent[field]) !== JSON.stringify(latest.snapshot[field]));
    return { agent_id: agent.id, configured: !!agent.system_prompt?.trim() && !!agent.greeting?.trim(), documents: documents.length, indexed_documents: indexed.length, chunks: indexed.reduce((sum, doc) => sum + doc.chunk_count, 0), tested: history.some(record => record.agent_id === agent.id), published: published.deployments.some(deployment => deployment.active), active_widgets: published.deployments.filter(deployment => deployment.active).length, draft_changed: draftChanged };
  });
  res.json({ success: true, runtime_mode: process.env.VOICEAI_RUNTIME_MODE === 'live' ? 'live' : 'demo', readiness });
});

router.param('agentId', (req, res, next, id) => {
  if (!ownsAgent(req, id)) return res.status(404).json({ success: false, error: { message: 'Agent not found' } });
  next();
});
router.post('/:agentId/publish', asyncHandler(async (req: Request, res: Response) => {
  if (!workspaceId(req)) return res.status(401).json({ success: false, error: { message: 'Sign in first' } });
  res.status(201).json({ success: true, version: await publishAgent(getAgentById(req.params.agentId)!, workspaceId(req)!) });
}));
router.get('/:agentId/deployments', (req, res) => res.json({ success: true, public_live_enabled: process.env.VOICEAI_PUBLIC_LIVE === 'true', ...listAgentDeployments(req.params.agentId, workspaceId(req)!) }));
router.post('/:agentId/deployments', asyncHandler(async (req: Request, res: Response) => {
  try { res.status(201).json({ success: true, deployment: await createDeployment(req.params.agentId, workspaceId(req)!, req.body) }); }
  catch (error) {
    if (error instanceof Error && error.message === 'PUBLIC_LIVE_DISABLED') return res.status(409).json({ success: false, error: { message: 'Public live AI is disabled on this server. Publish a demo preview, or explicitly enable public live access on the server.' } });
    if (error instanceof Error && error.message === 'INVALID_ORIGIN') return res.status(400).json({ success: false, error: { message: 'Use a full HTTPS origin with no path, such as https://example.com. HTTP is allowed only for localhost.' } });
    if (error instanceof Error && error.message === 'VERSION_NOT_FOUND') return res.status(404).json({ success: false, error: { message: 'Published version not found' } });
    throw error;
  }
}));
router.delete('/:agentId/deployments/:deploymentId', asyncHandler(async (req: Request, res: Response) => {
  const removed = await disableDeployment(req.params.deploymentId, req.params.agentId, workspaceId(req)!);
  res.status(removed ? 200 : 404).json({ success: removed });
}));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const workspace = workspaceId(req);
  if (workspace && workspaceNeedsTemplates(workspace)) {
    await editAgents(() => {
      if (!agents.some(agent => agent.workspace_id === workspace)) {
        agents.push(...defaultAgents.slice(0, 2).map(agent => ({ ...structuredClone(agent), is_default: false, id: `agent_${crypto.randomUUID()}`, workspace_id: workspace })));
      }
    });
    await markWorkspaceInitialized(workspace);
  }
  res.json({
    success: true,
    agents: visibleAgents(req),
  });
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { name, role, avatar, voice_id, voice_name, llm_model, llm_temperature, system_prompt, assigned_tools, greeting, id, languages_supported, default_language, auto_switch_language } = req.body;
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: { message: 'Agent name is required' } });
  }

  const agentId = id || `agent_${crypto.randomUUID()}`;
  if (id && workspaceId(req) && !ownsAgent(req, id)) return res.status(404).json({ success: false, error: { message: 'Agent not found' } });

  const newAgent: AgentModel = {
    id: agentId,
    workspace_id: workspaceId(req),
    name,
    role: role || 'Voice Assistant',
    avatar: avatar || '🤖',
    voice_id: voice_id || 'a0e99841-438c-4a64-b679-ae501e7d6091',
    voice_name: voice_name || 'Custom Voice',
    llm_model: llm_model || 'gpt-4o-mini',
    llm_temperature: typeof llm_temperature === 'number' ? llm_temperature : 0.3,
    system_prompt: system_prompt || 'You are a helpful voice assistant.',
    assigned_tools: assigned_tools ?? [],
    greeting: greeting || `Hello! I am ${name}. How can I assist you today?`,
    is_default: false,
    languages_supported,
    default_language,
    auto_switch_language,
  };

  const parsedAgent = AgentRecordModel.parse(newAgent);
  await editAgents(() => {
    const existingIdx = agents.findIndex(a => a.id === agentId);
    if (existingIdx >= 0) {
      const suppliedFields = Object.fromEntries(Object.entries(parsedAgent).filter(([, value]) => value !== undefined));
      agents[existingIdx] = AgentRecordModel.parse({ ...agents[existingIdx], ...suppliedFields });
    } else {
      agents.push(parsedAgent);
    }
  });

  res.json({
    success: true,
    agent: getAgentById(agentId),
    agents: visibleAgents(req),
  });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (workspaceId(req) && !ownsAgent(req, id)) return res.status(404).json({ success: false, error: { message: 'Agent not found' } });
  if (workspaceId(req)) await disableAgentDeployments(id, workspaceId(req)!);
  await editAgents(() => { agents = agents.filter(a => a.id !== id); });
  if (workspaceId(req)) closeAgentConversations(workspaceId(req)!, id);
  res.json({
    success: true,
    message: 'Agent deleted',
    agents: visibleAgents(req),
  });
}));

// ============================================================================
// Agent Knowledge Base & RAG Endpoints
// ============================================================================
import { ragEngine } from '../services/rag';

router.get('/:agentId/documents', (req: Request, res: Response) => {
  const { agentId } = req.params;
  const docs = ragEngine.listDocuments(agentId).filter(doc => !workspaceId(req) || doc.agent_id === agentId);
  res.json({
    success: true,
    agent_id: agentId,
    count: docs.length,
    documents: docs,
  });
});

router.post('/:agentId/documents', async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const { title, content, filename, file_type } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, error: { message: 'Title and content are required' } });
  }

  const type = file_type || 'md';
  const fname = filename || `${title.toLowerCase().replace(/\s+/g, '_')}.${type}`;
  const size = Buffer.byteLength(content, 'utf-8');

  try {
    const doc = await ragEngine.ingestText(agentId, title, fname, type, size, content);
    res.status(201).json({
      success: true,
      message: 'Document indexed successfully',
      document: doc,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message || 'Indexing failed' } });
  }
});

router.delete('/:agentId/documents/:docId', asyncHandler(async (req: Request, res: Response) => {
  const { docId, agentId } = req.params;
  if (workspaceId(req) && !ragEngine.listDocuments(agentId).some(doc => doc.id === docId && doc.agent_id === agentId)) return res.status(404).json({ success: false, error: { message: 'Document not found' } });
  const deleted = await ragEngine.deleteDocument(docId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: { message: 'Document not found' } });
  }
  res.json({
    success: true,
    message: 'Document deleted from agent knowledge base',
  });
}));

router.post('/:agentId/knowledge/query', (req: Request, res: Response) => {
  const { agentId } = req.params;
  const { query, top_k, min_score } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, error: { message: 'Query string is required' } });
  }

  const start = Date.now();
  const results = ragEngine.search(agentId, query, Math.min(10, Math.max(1, Number(top_k) || 2)), typeof min_score === 'number' ? min_score : 0.15, !workspaceId(req));
  res.json({
    success: true,
    agent_id: agentId,
    query,
    retrieval_latency_ms: Date.now() - start,
    results,
  });
});

export default router;
