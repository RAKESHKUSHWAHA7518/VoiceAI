import { workspaceCampaigns } from '../services/workspace_demos';
// ============================================================================
// Phase 9: Outbound Campaign Auto-Dialer & Lead Batch Calling Routes
// ============================================================================

import { Router, Request, Response } from 'express';
import { campaignManager, CallDisposition } from '../services/campaign';
import logger from '../utils/logger';

const router = Router();

// List all campaigns with progress metrics
router.get('/', (req: Request, res: Response) => {
  try {
    const campaigns = workspaceCampaigns(req).listCampaigns();
    res.json({
      success: true,
      count: campaigns.length,
      campaigns,
    });
  } catch (error: any) {
    logger.error('Failed to list campaigns:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new campaign
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, agent_id, agent_name, concurrent_lines, max_retries, contacts, csv } = req.body;

    if (!name || !agent_id) {
      return res.status(400).json({ success: false, error: 'Campaign name and agent_id are required' });
    }

    let parsedContacts = contacts || [];
    if (csv && typeof csv === 'string') {
      const csvLeads = workspaceCampaigns(req).parseCsvContacts(csv);
      parsedContacts = [...parsedContacts, ...csvLeads];
    }

    const campaign = workspaceCampaigns(req).createCampaign({
      name,
      description,
      agent_id,
      agent_name,
      concurrent_lines: Number(concurrent_lines) || 5,
      max_retries: Number(max_retries) || 2,
      contacts: parsedContacts,
    });

    res.status(201).json({
      success: true,
      campaign,
    });
  } catch (error: any) {
    logger.error('Failed to create campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get campaign details and contacts
router.get('/:id', (req: Request, res: Response) => {
  try {
    const campaign = workspaceCampaigns(req).getCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    res.json({
      success: true,
      campaign,
    });
  } catch (error: any) {
    logger.error('Failed to get campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import leads / contacts into existing campaign (JSON array or CSV string)
router.post('/:id/import', (req: Request, res: Response) => {
  try {
    const { contacts, csv } = req.body;
    let leadsToImport = contacts || [];

    if (csv && typeof csv === 'string') {
      const csvParsed = workspaceCampaigns(req).parseCsvContacts(csv);
      leadsToImport = [...leadsToImport, ...csvParsed];
    }

    if (!leadsToImport || leadsToImport.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid leads provided in contacts or csv field' });
    }

    const updated = workspaceCampaigns(req).importContacts(req.params.id, leadsToImport);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    res.json({
      success: true,
      imported_count: leadsToImport.length,
      total_leads: updated.total_leads,
      campaign: updated,
    });
  } catch (error: any) {
    logger.error('Failed to import contacts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start / Resume campaign auto-dialing
router.post('/:id/start', (req: Request, res: Response) => {
  try {
    const started = workspaceCampaigns(req).startCampaign(req.params.id);
    if (!started) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    res.json({
      success: true,
      status: started.status,
      campaign: started,
    });
  } catch (error: any) {
    logger.error('Failed to start campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pause campaign auto-dialing
router.post('/:id/pause', (req: Request, res: Response) => {
  try {
    const paused = workspaceCampaigns(req).pauseCampaign(req.params.id);
    if (!paused) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    res.json({
      success: true,
      status: paused.status,
      campaign: paused,
    });
  } catch (error: any) {
    logger.error('Failed to pause campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset campaign back to draft
router.post('/:id/reset', (req: Request, res: Response) => {
  try {
    const reset = workspaceCampaigns(req).resetCampaign(req.params.id);
    if (!reset) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    res.json({
      success: true,
      campaign: reset,
    });
  } catch (error: any) {
    logger.error('Failed to reset campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update single contact disposition
router.post('/:id/contacts/:contactId/disposition', (req: Request, res: Response) => {
  try {
    const { disposition, notes } = req.body;
    if (!disposition) {
      return res.status(400).json({ success: false, error: 'Disposition is required' });
    }

    const updated = workspaceCampaigns(req).updateContactDisposition(
      req.params.id,
      req.params.contactId,
      disposition as CallDisposition,
      notes
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Campaign or contact not found' });
    }

    res.json({
      success: true,
      contact: updated,
    });
  } catch (error: any) {
    logger.error('Failed to update disposition:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete campaign
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = workspaceCampaigns(req).deleteCampaign(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    res.json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
