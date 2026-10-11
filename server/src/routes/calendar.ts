// ============================================================================
// Phase 12: Calendar & Appointments REST Routes
// ============================================================================

import { Router, Request, Response } from 'express';
import { calendarManager } from '../services/calendar';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * Get available slots for a specific date (query param: ?date=YYYY-MM-DD or 'today'/'tomorrow')
 */
router.get(
  '/slots',
  asyncHandler(async (req: Request, res: Response) => {
    const dateQuery = req.query.date as string | undefined;
    const result = calendarManager.getAvailableSlots(dateQuery);
    res.json({
      success: true,
      date: result.date,
      slots: result.slots,
      count: result.slots.length,
    });
  })
);

/**
 * List all scheduled appointments
 */
router.get(
  '/appointments',
  asyncHandler(async (req: Request, res: Response) => {
    const appointments = calendarManager.listAppointments();
    res.json({
      success: true,
      appointments,
      count: appointments.length,
    });
  })
);

/**
 * Book a new appointment
 */
router.post(
  '/book',
  asyncHandler(async (req: Request, res: Response) => {
    const { customer_name, customer_phone, date, time, service, notes, agent_id } = req.body;

    if (!customer_name || !time) {
      res.status(400).json({
        success: false,
        error: 'customer_name and time are required fields',
      });
      return;
    }

    const appointment = calendarManager.bookAppointment({
      customer_name,
      customer_phone,
      date,
      time,
      service,
      notes,
      agent_id,
    });

    res.status(201).json({
      success: true,
      appointment,
    });
  })
);

/**
 * Cancel an appointment
 */
router.delete(
  '/appointments/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const cancelled = calendarManager.cancelAppointment(id);
    if (!cancelled) {
      res.status(404).json({
        success: false,
        error: `Appointment ${id} not found`,
      });
      return;
    }
    res.json({
      success: true,
      message: `Appointment ${id} cancelled successfully`,
    });
  })
);

export default router;
