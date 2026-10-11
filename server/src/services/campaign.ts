// ============================================================================
// Phase 9: Outbound Campaign Auto-Dialer & Lead Batch Calling Service
// High-concurrency predictive & progressive dialing engine with CSV ingestion
// ============================================================================

import crypto from 'crypto';
import logger from '../utils/logger';

export type ContactStatus = 'pending' | 'dialing' | 'connected' | 'completed' | 'voicemail' | 'failed';

export type CallDisposition =
  | 'Interested'
  | 'Scheduled Demo'
  | 'Call Back Later'
  | 'Voicemail Left'
  | 'Not Interested'
  | 'Do Not Call'
  | 'Unreachable'
  | 'Pending';

export interface LeadContact {
  id: string;
  name: string;
  phone_number: string;
  company?: string;
  variables: Record<string, any>;
  status: ContactStatus;
  disposition: CallDisposition;
  duration_sec: number;
  attempts: number;
  last_call_at?: string;
  summary?: string;
}

export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  agent_id: string;
  agent_name: string;
  status: CampaignStatus;
  total_leads: number;
  completed_calls: number;
  connected_calls: number;
  voicemails: number;
  failed_calls: number;
  concurrent_lines: number;
  max_retries: number;
  disposition_breakdown: Record<string, number>;
  contacts: LeadContact[];
  created_at: string;
  updated_at: string;
}

export class CampaignManager {
  private campaigns: Map<string, Campaign> = new Map();
  private dialerTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.seedDemoCampaigns();
  }

  private seedDemoCampaigns(): void {
    const healthcareCampaignId = 'camp-health-001';
    const saasCampaignId = 'camp-saas-002';
    const warrantyCampaignId = 'camp-tech-003';

    const healthContacts: LeadContact[] = [
      {
        id: 'cnt-01',
        name: 'Eleanor Vance',
        phone_number: '+1 (555) 392-1084',
        company: 'Providence Memorial',
        variables: { procedure: 'Cardiology Pre-Op', appointment_date: 'Tomorrow at 9:30 AM' },
        status: 'completed',
        disposition: 'Interested',
        duration_sec: 142,
        attempts: 1,
        last_call_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        summary: 'Confirmed arrival fasting instructions and scheduled check-in window.',
      },
      {
        id: 'cnt-02',
        name: 'Marcus Holloway',
        phone_number: '+1 (555) 741-9231',
        company: 'St. Jude Specialty',
        variables: { procedure: 'MRI Joint Scan', appointment_date: 'Thursday at 2:00 PM' },
        status: 'completed',
        disposition: 'Scheduled Demo',
        duration_sec: 185,
        attempts: 1,
        last_call_at: new Date(Date.now() - 3600000 * 3).toISOString(),
        summary: 'Patient confirmed MRI pre-screening questionnaire with zero contrast allergies.',
      },
      {
        id: 'cnt-03',
        name: 'Sophia Chen',
        phone_number: '+1 (555) 882-6419',
        company: 'Pacific Heights Clinic',
        variables: { procedure: 'Annual Wellness Consultation', appointment_date: 'Friday at 11:00 AM' },
        status: 'completed',
        disposition: 'Call Back Later',
        duration_sec: 64,
        attempts: 1,
        last_call_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        summary: 'Requested callback after 4:00 PM due to workplace meeting.',
      },
      {
        id: 'cnt-04',
        name: 'James Rodriguez',
        phone_number: '+1 (555) 419-7720',
        company: 'Metro Health Partners',
        variables: { procedure: 'Orthopedic Follow-Up', appointment_date: 'Next Monday at 10:15 AM' },
        status: 'completed',
        disposition: 'Voicemail Left',
        duration_sec: 32,
        attempts: 1,
        last_call_at: new Date(Date.now() - 3600000 * 5).toISOString(),
        summary: 'Standard HIPAA-compliant voicemail left with clinic callback direct dial.',
      },
      {
        id: 'cnt-05',
        name: 'Amara Okafor',
        phone_number: '+1 (555) 293-8471',
        company: 'Cedars Medical Center',
        variables: { procedure: 'Pediatric Vaccine Booster', appointment_date: 'Tomorrow at 3:30 PM' },
        status: 'pending',
        disposition: 'Pending',
        duration_sec: 0,
        attempts: 0,
      },
      {
        id: 'cnt-06',
        name: 'David Kim',
        phone_number: '+1 (555) 604-1829',
        company: 'Bay Area Ortho',
        variables: { procedure: 'Post-Surgery Physical Therapy', appointment_date: 'Wednesday at 8:00 AM' },
        status: 'pending',
        disposition: 'Pending',
        duration_sec: 0,
        attempts: 0,
      },
    ];

    this.campaigns.set(healthcareCampaignId, {
      id: healthcareCampaignId,
      name: 'Healthcare Patient Pre-Op Reminders',
      description: 'Automated HIPAA-compliant pre-operative call confirmations and fasting instruction delivery.',
      agent_id: 'agent-1',
      agent_name: 'Maya (Clinical Voice AI)',
      status: 'paused',
      total_leads: healthContacts.length,
      completed_calls: 4,
      connected_calls: 3,
      voicemails: 1,
      failed_calls: 0,
      concurrent_lines: 5,
      max_retries: 2,
      disposition_breakdown: {
        'Interested': 1,
        'Scheduled Demo': 1,
        'Call Back Later': 1,
        'Voicemail Left': 1,
      },
      contacts: healthContacts,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    });

    const saasContacts: LeadContact[] = [
      {
        id: 'cnt-saas-01',
        name: 'Rachel Sterling',
        phone_number: '+1 (555) 912-3847',
        company: 'Apex Cloud Solutions',
        variables: { contract_value: '$120,000 ARR', tier: 'Enterprise Plus' },
        status: 'completed',
        disposition: 'Interested',
        duration_sec: 210,
        attempts: 1,
        last_call_at: new Date(Date.now() - 7200000).toISOString(),
        summary: 'VP of Engineering interested in migrating 4 additional microservices to VoiceAI.',
      },
      {
        id: 'cnt-saas-02',
        name: 'Liam Gallagher',
        phone_number: '+1 (555) 781-9921',
        company: 'FinTrack Analytics',
        variables: { contract_value: '$65,000 ARR', tier: 'Professional' },
        status: 'completed',
        disposition: 'Scheduled Demo',
        duration_sec: 175,
        attempts: 1,
        last_call_at: new Date(Date.now() - 5400000).toISOString(),
        summary: 'Scheduled deep-dive technical demo with solutions architect for Thursday 3 PM EST.',
      },
      {
        id: 'cnt-saas-03',
        name: 'Carlos Mendoza',
        phone_number: '+1 (555) 420-1982',
        company: 'OmniVanguard Logistics',
        variables: { contract_value: '$88,000 ARR', tier: 'Enterprise' },
        status: 'pending',
        disposition: 'Pending',
        duration_sec: 0,
        attempts: 0,
      },
    ];

    this.campaigns.set(saasCampaignId, {
      id: saasCampaignId,
      name: 'Q4 Enterprise Renewal & Upsell Campaign',
      description: 'Proactive concierge touchpoints with high-value ARR customer accounts approaching renewal.',
      agent_id: 'agent-2',
      agent_name: 'Alex (Executive Concierge)',
      status: 'draft',
      total_leads: saasContacts.length,
      completed_calls: 2,
      connected_calls: 2,
      voicemails: 0,
      failed_calls: 0,
      concurrent_lines: 10,
      max_retries: 3,
      disposition_breakdown: {
        'Interested': 1,
        'Scheduled Demo': 1,
      },
      contacts: saasContacts,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString(),
    });
  }

  public listCampaigns(): Campaign[] {
    return Array.from(this.campaigns.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public getCampaign(id: string): Campaign | undefined {
    return this.campaigns.get(id);
  }

  public createCampaign(data: {
    name: string;
    description?: string;
    agent_id: string;
    agent_name?: string;
    concurrent_lines?: number;
    max_retries?: number;
    contacts?: Partial<LeadContact>[];
  }): Campaign {
    const id = `camp-${crypto.randomUUID().slice(0, 8)}`;
    const parsedContacts: LeadContact[] = (data.contacts || []).map((c, idx) => ({
      id: c.id || `cnt-${id}-${idx + 1}`,
      name: c.name || 'Unnamed Lead',
      phone_number: c.phone_number || '+1 (555) 000-0000',
      company: c.company || '',
      variables: c.variables || {},
      status: 'pending',
      disposition: 'Pending',
      duration_sec: 0,
      attempts: 0,
    }));

    const newCampaign: Campaign = {
      id,
      name: data.name,
      description: data.description || 'Outbound predictive auto-dialing campaign',
      agent_id: data.agent_id,
      agent_name: data.agent_name || 'Maya (Conversational Voice AI)',
      status: 'draft',
      total_leads: parsedContacts.length,
      completed_calls: 0,
      connected_calls: 0,
      voicemails: 0,
      failed_calls: 0,
      concurrent_lines: Math.max(1, Math.min(50, data.concurrent_lines || 5)),
      max_retries: data.max_retries || 2,
      disposition_breakdown: {},
      contacts: parsedContacts,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.campaigns.set(id, newCampaign);
    logger.info(`Campaign created: ${id} (${newCampaign.name}) with ${parsedContacts.length} leads`);
    return newCampaign;
  }

  public parseCsvContacts(csvContent: string): Partial<LeadContact>[] {
    const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const contacts: Partial<LeadContact>[] = [];
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));

    const nameIdx = headers.findIndex(h => h.includes('name'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('tel') || h.includes('mobile'));
    const companyIdx = headers.findIndex(h => h.includes('company') || h.includes('org'));

    const startIndex = (nameIdx !== -1 || phoneIdx !== -1) ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length === 0 || !parts.some(Boolean)) continue;

      let name = 'Lead Contact';
      let phone = '';
      let company = '';
      const variables: Record<string, any> = {};

      if (nameIdx !== -1 && parts[nameIdx]) name = parts[nameIdx];
      if (phoneIdx !== -1 && parts[phoneIdx]) phone = parts[phoneIdx];
      if (companyIdx !== -1 && parts[companyIdx]) company = parts[companyIdx];

      // If no headers matched, use first as name, second as phone
      if (!phone && parts.length >= 2) {
        name = parts[0];
        phone = parts[1];
        if (parts[2]) company = parts[2];
      } else if (!phone && parts.length === 1) {
        phone = parts[0];
      }

      // Collect rest into custom variables
      headers.forEach((header, colIdx) => {
        if (colIdx !== nameIdx && colIdx !== phoneIdx && colIdx !== companyIdx && parts[colIdx]) {
          variables[header] = parts[colIdx];
        }
      });

      if (phone) {
        contacts.push({
          name: name || 'Valued Lead',
          phone_number: phone,
          company,
          variables,
        });
      }
    }

    return contacts;
  }

  public importContacts(campaignId: string, contacts: Partial<LeadContact>[]): Campaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;

    const newLeads: LeadContact[] = contacts.map((c, idx) => ({
      id: c.id || `cnt-${campaignId}-${campaign.contacts.length + idx + 1}`,
      name: c.name || 'Unnamed Lead',
      phone_number: c.phone_number || '+1 (555) 000-0000',
      company: c.company || '',
      variables: c.variables || {},
      status: 'pending',
      disposition: 'Pending',
      duration_sec: 0,
      attempts: 0,
    }));

    campaign.contacts.push(...newLeads);
    campaign.total_leads = campaign.contacts.length;
    campaign.updated_at = new Date().toISOString();
    return campaign;
  }

  public startCampaign(campaignId: string): Campaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;

    campaign.status = 'running';
    campaign.updated_at = new Date().toISOString();

    // Start dialing queue simulator
    this.tickDialer(campaignId);
    return campaign;
  }

  public pauseCampaign(campaignId: string): Campaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;

    campaign.status = 'paused';
    campaign.updated_at = new Date().toISOString();

    const timer = this.dialerTimers.get(campaignId);
    if (timer) {
      clearInterval(timer);
      this.dialerTimers.delete(campaignId);
    }
    return campaign;
  }

  public resetCampaign(campaignId: string): Campaign | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;

    this.pauseCampaign(campaignId);

    campaign.status = 'draft';
    campaign.completed_calls = 0;
    campaign.connected_calls = 0;
    campaign.voicemails = 0;
    campaign.failed_calls = 0;
    campaign.disposition_breakdown = {};
    campaign.contacts.forEach(c => {
      c.status = 'pending';
      c.disposition = 'Pending';
      c.duration_sec = 0;
      c.attempts = 0;
      c.last_call_at = undefined;
      c.summary = undefined;
    });
    campaign.updated_at = new Date().toISOString();
    return campaign;
  }

  public updateContactDisposition(
    campaignId: string,
    contactId: string,
    disposition: CallDisposition,
    notes?: string
  ): LeadContact | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;

    const contact = campaign.contacts.find(c => c.id === contactId);
    if (!contact) return undefined;

    // Adjust disposition breakdown counters
    if (contact.disposition && contact.disposition !== 'Pending') {
      campaign.disposition_breakdown[contact.disposition] = Math.max(
        0,
        (campaign.disposition_breakdown[contact.disposition] || 1) - 1
      );
    }

    contact.disposition = disposition;
    if (notes) contact.summary = notes;

    campaign.disposition_breakdown[disposition] = (campaign.disposition_breakdown[disposition] || 0) + 1;
    campaign.updated_at = new Date().toISOString();
    return contact;
  }

  public deleteCampaign(campaignId: string): boolean {
    this.pauseCampaign(campaignId);
    return this.campaigns.delete(campaignId);
  }

  private tickDialer(campaignId: string): void {
    if (this.dialerTimers.has(campaignId)) return;

    const timer = setInterval(() => {
      const campaign = this.campaigns.get(campaignId);
      if (!campaign || campaign.status !== 'running') {
        clearInterval(timer);
        this.dialerTimers.delete(campaignId);
        return;
      }

      // Find pending leads
      const pendingLeads = campaign.contacts.filter(c => c.status === 'pending');
      if (pendingLeads.length === 0) {
        campaign.status = 'completed';
        campaign.updated_at = new Date().toISOString();
        clearInterval(timer);
        this.dialerTimers.delete(campaignId);
        logger.info(`Campaign ${campaignId} reached completion.`);
        return;
      }

      // Pick batch up to concurrent_lines
      const activeDialing = campaign.contacts.filter(c => c.status === 'dialing').length;
      const availableLines = Math.max(0, campaign.concurrent_lines - activeDialing);
      const batchToDial = pendingLeads.slice(0, Math.min(availableLines, 2));

      for (const lead of batchToDial) {
        lead.status = 'dialing';
        lead.attempts += 1;
        lead.last_call_at = new Date().toISOString();

        // Simulate call outcome after 1.5s
        setTimeout(() => {
          if (!this.campaigns.has(campaignId)) return;

          const roll = Math.random();
          if (roll < 0.65) {
            // Connected call
            lead.status = 'completed';
            lead.duration_sec = Math.floor(45 + Math.random() * 180);
            const dispRoll = Math.random();
            if (dispRoll < 0.45) {
              lead.disposition = 'Interested';
              lead.summary = 'Lead engaged with AI voice agent, answered qualifying questions positively.';
            } else if (dispRoll < 0.75) {
              lead.disposition = 'Scheduled Demo';
              lead.summary = 'Agent scheduled follow-up consultation with specialist.';
            } else {
              lead.disposition = 'Call Back Later';
              lead.summary = 'Requested follow-up during regular business hours.';
            }
            campaign.connected_calls += 1;
          } else if (roll < 0.85) {
            // Voicemail
            lead.status = 'completed';
            lead.duration_sec = Math.floor(25 + Math.random() * 20);
            lead.disposition = 'Voicemail Left';
            lead.summary = 'Answering machine detected; automated audio message delivered.';
            campaign.voicemails += 1;
          } else {
            // Unreachable or busy
            if (lead.attempts < campaign.max_retries) {
              lead.status = 'pending'; // retry next cycle
              lead.disposition = 'Pending';
            } else {
              lead.status = 'failed';
              lead.duration_sec = 0;
              lead.disposition = 'Unreachable';
              lead.summary = 'Line busy or disconnected after max retries.';
              campaign.failed_calls += 1;
            }
          }

          if (lead.status === 'completed' || lead.status === 'failed') {
            campaign.completed_calls += 1;
            campaign.disposition_breakdown[lead.disposition] =
              (campaign.disposition_breakdown[lead.disposition] || 0) + 1;
          }

          campaign.updated_at = new Date().toISOString();
        }, 1500);
      }
    }, 2000);

    this.dialerTimers.set(campaignId, timer);
  }
}

export const campaignManager = new CampaignManager();
