import { Router, Request, Response } from 'express';

export interface AgentModel {
  id: string;
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
    system_prompt: 'You are Maya, a helpful and empathetic customer support specialist. Speak warmly and concisely in spoken-language sentences. When users ask for bookings or transfers, use the available tools.',
    assigned_tools: ['check_booking', 'transfer_call'],
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
    llm_model: 'gpt-4o-mini',
    llm_temperature: 0.2,
    system_prompt: 'You are Alex, an upbeat travel concierge and weather reporter. Provide accurate real-time forecasts and travel guidance using your weather tools.',
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
    llm_model: 'gpt-4o',
    llm_temperature: 0.3,
    system_prompt: 'You are Elena, a 5-star hotel front desk assistant. Handle reservations, dining bookings, and weather checks with elegance and grace.',
    assigned_tools: ['check_booking', 'get_weather'],
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

let agents: AgentModel[] = [...defaultAgents];

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    agents,
  });
});

router.post('/', (req: Request, res: Response) => {
  const { name, role, avatar, voice_id, voice_name, llm_model, llm_temperature, system_prompt, assigned_tools, greeting, id } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: { message: 'Agent name is required' } });
  }

  const agentId = id || `agent_${Date.now().toString(36)}`;
  const existingIdx = agents.findIndex(a => a.id === agentId);

  const newAgent: AgentModel = {
    id: agentId,
    name,
    role: role || 'Voice Assistant',
    avatar: avatar || '🤖',
    voice_id: voice_id || 'a0e99841-438c-4a64-b679-ae501e7d6091',
    voice_name: voice_name || 'Custom Voice',
    llm_model: llm_model || 'gpt-4o-mini',
    llm_temperature: typeof llm_temperature === 'number' ? llm_temperature : 0.3,
    system_prompt: system_prompt || 'You are a helpful voice assistant.',
    assigned_tools: Array.isArray(assigned_tools) ? assigned_tools : ['get_weather', 'check_booking', 'transfer_call'],
    greeting: greeting || `Hello! I am ${name}. How can I assist you today?`,
    is_default: false,
  };

  if (existingIdx >= 0) {
    agents[existingIdx] = { ...agents[existingIdx], ...newAgent };
  } else {
    agents.push(newAgent);
  }

  res.json({
    success: true,
    agent: newAgent,
    agents,
  });
});

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  agents = agents.filter(a => a.id !== id);
  res.json({
    success: true,
    message: 'Agent deleted',
    agents,
  });
});

// ============================================================================
// Agent Knowledge Base & RAG Endpoints
// ============================================================================
import { ragEngine } from '../services/rag';

router.get('/:agentId/documents', (req: Request, res: Response) => {
  const { agentId } = req.params;
  const docs = ragEngine.listDocuments(agentId);
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

router.delete('/:agentId/documents/:docId', (req: Request, res: Response) => {
  const { docId } = req.params;
  const deleted = ragEngine.deleteDocument(docId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: { message: 'Document not found' } });
  }
  res.json({
    success: true,
    message: 'Document deleted from agent knowledge base',
  });
});

router.post('/:agentId/knowledge/query', (req: Request, res: Response) => {
  const { agentId } = req.params;
  const { query, top_k, min_score } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, error: { message: 'Query string is required' } });
  }

  const start = Date.now();
  const results = ragEngine.search(agentId, query, Number(top_k) || 2, typeof min_score === 'number' ? min_score : 0.15);
  res.json({
    success: true,
    agent_id: agentId,
    query,
    retrieval_latency_ms: Date.now() - start,
    results,
  });
});

export default router;
