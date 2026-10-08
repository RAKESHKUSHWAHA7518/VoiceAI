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
  is_default?: boolean;
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
    is_default: true,
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
  const { name, role, avatar, voice_id, voice_name, llm_model, llm_temperature, system_prompt, assigned_tools, id } = req.body;
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

export default router;
