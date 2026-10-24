import { dataPath } from '../config/storage';
import { AppointmentModel } from '../models/appointment.model';
import type { AppointmentRecord } from '../models/appointment.model';
export type { AppointmentRecord } from '../models/appointment.model';
// ============================================================================
// Phase 12: Interactive In-Call Appointment & Calendar Booking Service
// Handles real-time slot checking, appointment reservation, and rescheduling
// ============================================================================

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import { PersistentStore, isMongoEnabled } from './database';


const DATA_DIR = dataPath();
const APPOINTMENTS_FILE = path.join(DATA_DIR, 'appointments.json');

const DEFAULT_SLOTS = [
  '09:00 AM',
  '10:30 AM',
  '11:30 AM',
  '01:30 PM',
  '02:30 PM',
  '03:45 PM',
  '04:30 PM',
];

export class CalendarManager {
  private appointments: AppointmentRecord[] = [];
  private store = new PersistentStore(AppointmentModel, APPOINTMENTS_FILE, () => this.appointments, records => { this.appointments = records; });

  constructor() {
    this.loadAppointments();
  }

  private loadAppointments(): void {
    try {
      if (fs.existsSync(APPOINTMENTS_FILE)) {
        const raw = fs.readFileSync(APPOINTMENTS_FILE, 'utf-8');
        this.appointments = JSON.parse(raw);
      } else {
        // Seed default initial appointments
        const todayStr = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        this.appointments = [
          {
            id: 'APT-1001',
            customer_name: 'David Miller',
            customer_phone: '+1 (555) 234-5678',
            date: todayStr,
            time: '09:00 AM',
            service: 'Diagnostic Consultation',
            status: 'confirmed',
            notes: 'Patient requesting orthopedic follow-up review',
            created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          },
          {
            id: 'APT-1002',
            customer_name: 'Elena Rostova',
            customer_phone: '+1 (555) 345-6789',
            date: tomorrow,
            time: '01:30 PM',
            service: 'VIP Mortgage Pre-approval Review',
            status: 'confirmed',
            notes: 'Bring W2 statements and recent tax filings',
            created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
          },
        ];
        if (!isMongoEnabled()) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(APPOINTMENTS_FILE, JSON.stringify(this.appointments, null, 2));
        }
      }
    } catch (err) {
      logger.error('Failed to load appointments file:', err);
      this.appointments = [];
    }
  }

  private saveAppointments(): Promise<void> {
    return this.store.save();
  }

  /**
   * Resolve relative date terms like 'today', 'tomorrow' to YYYY-MM-DD
   */
  public normalizeDate(dateQuery?: string): string {
    if (!dateQuery) {
      return new Date().toISOString().split('T')[0];
    }
    const lower = dateQuery.toLowerCase().trim();
    if (lower === 'today') {
      return new Date().toISOString().split('T')[0];
    }
    if (lower === 'tomorrow') {
      return new Date(Date.now() + 86400000).toISOString().split('T')[0];
    }
    if (lower.includes('next monday') || lower.includes('monday')) {
      const d = new Date();
      d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
      return d.toISOString().split('T')[0];
    }
    // Check if valid YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateQuery)) {
      return dateQuery;
    }
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Return available slots for a given date
   */
  public getAvailableSlots(dateQuery?: string): { date: string; slots: string[] } {
    const date = this.normalizeDate(dateQuery);
    const bookedTimes = new Set(
      this.appointments
        .filter(a => a.date === date && a.status === 'confirmed')
        .map(a => a.time)
    );

    const openSlots = DEFAULT_SLOTS.filter(slot => !bookedTimes.has(slot));
    return { date, slots: openSlots };
  }

  /**
   * Book an appointment
   */
  public async bookAppointment(params: {
    customer_name: string;
    customer_phone: string;
    date?: string;
    time: string;
    service?: string;
    notes?: string;
    agent_id?: string;
  }): Promise<AppointmentRecord> {
    const date = this.normalizeDate(params.date);
    const id = `APT-${Math.floor(1000 + Math.random() * 9000)}`;

    const newAppointment: AppointmentRecord = {
      id,
      customer_name: params.customer_name || 'Valued Caller',
      customer_phone: params.customer_phone || '+1 (555) 000-0000',
      date,
      time: params.time || '10:30 AM',
      service: params.service || 'General Voice Consultation',
      status: 'confirmed',
      notes: params.notes,
      agent_id: params.agent_id,
      created_at: new Date().toISOString(),
    };

    this.appointments.unshift(newAppointment);
    await this.saveAppointments();

    logger.info(`[Calendar] Booked appointment ${id} for ${newAppointment.customer_name} on ${date} at ${newAppointment.time}`);
    return newAppointment;
  }

  /**
   * Cancel an appointment
   */
  public async cancelAppointment(id: string): Promise<boolean> {
    const apt = this.appointments.find(a => a.id === id);
    if (!apt) return false;
    apt.status = 'cancelled';
    await this.saveAppointments();
    return true;
  }

  /**
   * List all appointments
   */
  public listAppointments(): AppointmentRecord[] {
    return this.appointments;
  }
}

export const calendarManager = new CalendarManager();
