// ============================================================================
// Phase 14: Virtual PSTN Softphone & Web Dialpad Component
// Authentic Dual-Tone Multi-Frequency (DTMF) Web Audio synthesis and Twilio carrier stream
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import type { SoftphoneSession } from '../../types';

// DTMF standard frequencies
const DTMF_TONES: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
};

const DIALPAD_KEYS = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

export function VirtualSoftphone() {
  const [phoneNumber, setPhoneNumber] = useState<string>('+1 (415) 555-0199');
  const [callSession, setCallSession] = useState<SoftphoneSession | null>(null);
  const [callState, setCallState] = useState<'idle' | 'dialing' | 'connected' | 'ended'>('idle');
  const [callDuration, setCallDuration] = useState<number>(0);
  const [twimlOutput, setTwimlOutput] = useState<string | null>(null);
  const [dtmfLogs, setDtmfLogs] = useState<Array<{ digit: string; time: string; freqs: string }>>([]);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<any>(null);

  // Play genuine DTMF dual tone via Web Audio API oscillators
  const playDtmfTone = (digit: string) => {
    const freqs = DTMF_TONES[digit];
    if (!freqs) return;

    try {
      if (!audioCtxRef.current && typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }

      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.frequency.setValueAtTime(freqs[0], now);
      osc2.frequency.setValueAtTime(freqs[1], now);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.18, now + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.14);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.15);
      osc2.stop(now + 0.15);
    } catch {
      // AudioContext might be blocked until user interaction
    }
  };

  const handleDigitPress = async (digit: string) => {
    playDtmfTone(digit);
    setPhoneNumber(prev => prev + digit);

    // If call is active, transmit DTMF over telephony bridge
    if (callState === 'connected' && callSession) {
      const freqs = DTMF_TONES[digit];
      setDtmfLogs(prev => [
        {
          digit,
          time: new Date().toLocaleTimeString(),
          freqs: `${freqs[0]}Hz / ${freqs[1]}Hz`,
        },
        ...prev.slice(0, 7),
      ]);

      try {
        await fetch('/api/telephony/softphone/dtmf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ digit, call_sid: callSession.call_sid }),
        });
      } catch (err) {
        console.error('DTMF transmission error:', err);
      }
    }
  };

  const handleDial = async () => {
    if (!phoneNumber.trim()) return;

    setCallState('dialing');
    setCallDuration(0);
    playDtmfTone('1');

    try {
      const res = await fetch('/api/telephony/softphone/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_number: phoneNumber.trim(),
          agent_name: 'Maya (Enterprise Concierge)',
        }),
      });

      const data = await res.json();
      if (data.success && data.session) {
        setCallSession(data.session);
        setTwimlOutput(data.twiml);
        setCallState('connected');

        timerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      } else {
        setCallState('idle');
        alert(data.error || 'Failed to place call');
      }
    } catch (err: any) {
      setCallState('idle');
      alert(`Carrier call error: ${err.message}`);
    }
  };

  const handleHangup = async () => {
    clearInterval(timerRef.current);
    setCallState('ended');

    try {
      await fetch('/api/telephony/softphone/hangup', { method: 'POST' });
    } catch (err) {
      console.error('Hangup error:', err);
    }

    setTimeout(() => {
      setCallState('idle');
      setCallSession(null);
    }, 1200);
  };

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.5rem',
        marginTop: '1.5rem',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem',
          paddingBottom: '0.85rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '1.4rem' }}>☎️</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                Virtual PSTN Softphone & Web Dialpad
              </h3>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '0.15rem 0.55rem',
                  borderRadius: '999px',
                  background:
                    callState === 'connected'
                      ? 'rgba(16, 185, 129, 0.2)'
                      : callState === 'dialing'
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(56, 189, 248, 0.15)',
                  color:
                    callState === 'connected'
                      ? '#34d399'
                      : callState === 'dialing'
                      ? '#fbbf24'
                      : '#38bdf8',
                  border:
                    callState === 'connected'
                      ? '1px solid rgba(16, 185, 129, 0.35)'
                      : callState === 'dialing'
                      ? '1px solid rgba(245, 158, 11, 0.35)'
                      : '1px solid rgba(56, 189, 248, 0.25)',
                }}
              >
                {callState === 'connected'
                  ? `LIVE CALL • ${formatTimer(callDuration)}`
                  : callState === 'dialing'
                  ? 'RINGING CARRIER...'
                  : 'CARRIER READY'}
              </span>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
              Dual-Tone Multi-Frequency (DTMF) dialer connecting directly to Twilio PSTN TwiML Media Streams.
            </p>
          </div>
        </div>

        {/* Network Quality Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: '#94a3b8' }}>
          <div>
            Trunk: <strong style={{ color: '#38bdf8' }}>Twilio Voice</strong>
          </div>
          <div>
            Codec: <strong style={{ color: '#e2e8f0' }}>G.711 $\mu$-law</strong>
          </div>
          <div>
            Jitter: <strong style={{ color: '#34d399' }}>3.8ms</strong>
          </div>
        </div>
      </div>

      {/* Main Grid: Softphone Device vs Carrier Diagnostics */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Softphone Hardware Chassis */}
        <div
          style={{
            background: 'linear-gradient(180deg, #111827 0%, #0b0f19 100%)',
            border: '1.5px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '20px',
            padding: '1.25rem',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            maxWidth: '320px',
          }}
        >
          {/* LCD Display */}
          <div
            style={{
              background: 'rgba(5, 7, 14, 0.95)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
              boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.8)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b', marginBottom: '0.25rem' }}>
              <span>LINE 1 • PSTN ACTIVE</span>
              <span style={{ color: callState === 'connected' ? '#34d399' : '#64748b', fontWeight: 700 }}>
                {callState === 'connected' ? formatTimer(callDuration) : 'READY'}
              </span>
            </div>

            <div
              style={{
                fontSize: '1.25rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#f8fafc',
                letterSpacing: '0.05em',
                minHeight: '30px',
                display: 'flex',
                alignItems: 'center',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              {phoneNumber || 'Enter Number...'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={() => setPhoneNumber(prev => prev.slice(0, -1))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ⌫ Backspace
              </button>
              <button
                type="button"
                onClick={() => setPhoneNumber('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Dialpad Matrix 3x4 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem', marginBottom: '1.25rem' }}>
            {DIALPAD_KEYS.map(({ digit, letters }) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigitPress(digit)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '0.75rem 0',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.94)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <span style={{ fontSize: '1.2rem', fontWeight: 700, lineHeight: 1 }}>{digit}</span>
                {letters && (
                  <span style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.1em', marginTop: '2px' }}>
                    {letters}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Call Control Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {callState !== 'connected' && callState !== 'dialing' ? (
              <button
                type="button"
                onClick={handleDial}
                style={{
                  gridColumn: '1 / -1',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.85rem',
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                }}
              >
                <span>📞</span>
                <span>Dial Call</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  style={{
                    background: isMuted ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    color: isMuted ? '#fbbf24' : '#e2e8f0',
                    border: isMuted ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '0.85rem',
                    borderRadius: '12px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {isMuted ? '🔇 Unmute' : '🎙️ Mute'}
                </button>

                <button
                  type="button"
                  onClick={handleHangup}
                  style={{
                    background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.85rem',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(239, 68, 68, 0.35)',
                  }}
                >
                  End Call
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Panel: Live Carrier TwiML Stream & DTMF Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Active Call Information */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
              📡 Telephony Carrier Stream Status
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
              <div>
                <span style={{ color: '#64748b' }}>Call SID: </span>
                <strong style={{ color: '#38bdf8', fontFamily: 'monospace' }}>
                  {callSession?.call_sid || 'CA_standby_idle'}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Destination: </span>
                <strong style={{ color: '#e2e8f0' }}>{callSession?.to_number || phoneNumber}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Caller ID: </span>
                <strong style={{ color: '#e2e8f0' }}>{callSession?.from_number || '+1 (555) 902-8800'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Agent: </span>
                <strong style={{ color: '#34d399' }}>{callSession?.agent_name || 'Maya (Support Lead)'}</strong>
              </div>
            </div>
          </div>

          {/* Generated TwiML Carrier Response */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Twilio TwiML Carrier Payload
              </h4>
              <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontFamily: 'monospace' }}>
                Content-Type: text/xml
              </span>
            </div>

            <pre
              style={{
                margin: 0,
                background: 'rgba(5, 7, 14, 0.95)',
                padding: '0.85rem',
                borderRadius: '8px',
                color: '#34d399',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                overflowX: 'auto',
                lineHeight: 1.5,
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {twimlOutput ||
`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Connecting carrier call to VoiceAI. Please speak now.</Say>
  <Connect>
    <Stream url="wss://localhost:8000/media-stream">
      <Parameter name="agentId" value="agent_support" />
    </Stream>
  </Connect>
</Response>`}
            </pre>
          </div>

          {/* Real-time DTMF Transmission Audit */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              Live DTMF Tone Injections ({dtmfLogs.length})
            </h4>

            {dtmfLogs.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.78rem' }}>
                Press dialpad digits during an active call to transmit live DTMF in-band telephony tones.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {dtmfLogs.map((log, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      borderRadius: '6px',
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.75rem',
                      color: '#e2e8f0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <strong style={{ color: '#38bdf8', fontSize: '0.9rem' }}>'{log.digit}'</strong>
                    <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>({log.freqs})</span>
                    <span style={{ color: '#64748b', fontSize: '0.65rem' }}>{log.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
