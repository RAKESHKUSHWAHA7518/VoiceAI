// ============================================================================
// Phase 12: In-Call Calendar & Appointment Booking Widget
// Real-time synchronization of open slots and confirmed appointments booked by agents
// ============================================================================

import { useState, useEffect } from 'react';
import type { AppointmentRecord } from '../../types';

export function CalendarWidget() {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [todaySlots, setTodaySlots] = useState<string[]>([]);
  const [tomorrowSlots, setTomorrowSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeDateTab, setActiveDateTab] = useState<'today' | 'tomorrow'>('today');

  // Manual booking modal
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [custName, setCustName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('+1 (555) 789-0123');
  const [selectedSlot, setSelectedSlot] = useState<string>('10:30 AM');
  const [service, setService] = useState<string>('Voice Consultation');
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);

  const fetchCalendarData = async () => {
    try {
      // 1. Appointments
      const apptRes = await fetch('/api/calendar/appointments');
      const apptData = await apptRes.json();
      if (apptData.appointments) {
        setAppointments(apptData.appointments);
      }

      // 2. Today Slots
      const todayRes = await fetch('/api/calendar/slots?date=today');
      const todayData = await todayRes.json();
      if (todayData.slots) {
        setTodaySlots(todayData.slots);
      }

      // 3. Tomorrow Slots
      const tomRes = await fetch('/api/calendar/slots?date=tomorrow');
      const tomData = await tomRes.json();
      if (tomData.slots) {
        setTomorrowSlots(tomData.slots);
      }
    } catch (err) {
      console.error('Failed to load calendar data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarData();
    // Auto-refresh periodically to catch voice bot bookings
    const interval = setInterval(fetchCalendarData, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleManualBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) return;

    try {
      const res = await fetch('/api/calendar/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: custName.trim(),
          customer_phone: custPhone.trim(),
          date: activeDateTab,
          time: selectedSlot,
          service,
        }),
      });

      const data = await res.json();
      if (data.success && data.appointment) {
        setBookingSuccessMsg(`Confirmed: ${data.appointment.id} for ${data.appointment.customer_name}`);
        await fetchCalendarData();
        setTimeout(() => {
          setShowManualModal(false);
          setBookingSuccessMsg(null);
          setCustName('');
        }, 1200);
      }
    } catch (err: any) {
      alert(`Booking error: ${err.message}`);
    }
  };

  const handleCancelAppointment = async (id: string) => {
    if (!confirm(`Cancel appointment ${id}?`)) return;
    try {
      await fetch(`/api/calendar/appointments/${id}`, { method: 'DELETE' });
      await fetchCalendarData();
    } catch (err) {
      console.error('Failed to cancel appointment:', err);
    }
  };

  const slotsToDisplay = activeDateTab === 'today' ? todaySlots : tomorrowSlots;
  const activeConfirmed = appointments.filter(a => a.status === 'confirmed');

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '1.25rem',
        marginTop: '1.5rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Widget Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.25rem' }}>📅</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                In-Call Calendar & Appointments
              </h3>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '999px',
                }}
              >
                {activeConfirmed.length} CONFIRMED
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
              Voice AI tools <code style={{ color: '#38bdf8' }}>check_availability</code> and <code style={{ color: '#38bdf8' }}>book_appointment</code> update this live schedule.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={fetchCalendarData}
            title="Refresh schedule"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              padding: '0.4rem 0.65rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            🔄 Sync
          </button>
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              color: '#ffffff',
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Book Slot
          </button>
        </div>
      </div>

      {/* Two Column Layout: Slots vs Confirmed Bookings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr', gap: '1.25rem' }}>
        {/* Left Column: Open Slots */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: '8px',
            padding: '1rem',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Day Selector Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
            <button
              type="button"
              onClick={() => setActiveDateTab('today')}
              style={{
                flex: 1,
                padding: '0.45rem 0.5rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: activeDateTab === 'today' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                background: activeDateTab === 'today' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: activeDateTab === 'today' ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Today ({todaySlots.length} Open)
            </button>
            <button
              type="button"
              onClick={() => setActiveDateTab('tomorrow')}
              style={{
                flex: 1,
                padding: '0.45rem 0.5rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: activeDateTab === 'tomorrow' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                background: activeDateTab === 'tomorrow' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: activeDateTab === 'tomorrow' ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Tomorrow ({tomorrowSlots.length} Open)
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Available Time Slots
          </div>

          {loading ? (
            <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '1rem 0' }}>Loading slots...</div>
          ) : slotsToDisplay.length === 0 ? (
            <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '1rem 0' }}>No open slots for this date.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: '0.5rem' }}>
              {slotsToDisplay.map((slot) => (
                <div
                  key={slot}
                  style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    color: '#34d399',
                    padding: '0.45rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textAlign: 'center',
                    fontFamily: 'monospace',
                  }}
                >
                  {slot}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Confirmed Appointments */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: '8px',
            padding: '1rem',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
            Confirmed Consultations
          </div>

          {appointments.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '1rem 0' }}>
              No appointments scheduled yet. Speak to your agent to test booking!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {appointments.map((apt) => {
                const isCancelled = apt.status === 'cancelled';
                return (
                  <div
                    key={apt.id}
                    style={{
                      background: isCancelled ? 'rgba(239, 68, 68, 0.06)' : 'rgba(255, 255, 255, 0.04)',
                      border: isCancelled ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '0.65rem 0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
                          {apt.id}
                        </span>
                        <strong style={{ fontSize: '0.85rem', color: isCancelled ? '#94a3b8' : '#f8fafc' }}>
                          {apt.customer_name}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            background: isCancelled ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                            color: isCancelled ? '#f87171' : '#34d399',
                          }}
                        >
                          {apt.status}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        📅 {apt.date} at <strong style={{ color: '#e2e8f0' }}>{apt.time}</strong> • {apt.service}
                      </div>
                    </div>

                    {!isCancelled && (
                      <button
                        type="button"
                        onClick={() => handleCancelAppointment(apt.id)}
                        title="Cancel appointment"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          padding: '0.2rem 0.4rem',
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manual Booking Modal */}
      {showManualModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(5, 7, 14, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#f8fafc' }}>
              Schedule Appointment Slot
            </h3>

            {bookingSuccessMsg && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                {bookingSuccessMsg}
              </div>
            )}

            <form onSubmit={handleManualBook}>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Wick"
                  value={custName}
                  onChange={e => setCustName(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    padding: '0.55rem 0.75rem',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  Customer Phone
                </label>
                <input
                  type="text"
                  placeholder="+1 (555) 000-0000"
                  value={custPhone}
                  onChange={e => setCustPhone(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    padding: '0.55rem 0.75rem',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                    Date
                  </label>
                  <select
                    value={activeDateTab}
                    onChange={e => setActiveDateTab(e.target.value as any)}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      padding: '0.55rem 0.75rem',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="today">Today</option>
                    <option value="tomorrow">Tomorrow</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                    Time Slot
                  </label>
                  <select
                    value={selectedSlot}
                    onChange={e => setSelectedSlot(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      padding: '0.55rem 0.75rem',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                    }}
                  >
                    {slotsToDisplay.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  Service / Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Diagnostic Consultation"
                  value={service}
                  onChange={e => setService(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    padding: '0.55rem 0.75rem',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#94a3b8',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Confirm Reservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
