// ============================================================================
// Voice Library & Live Voice Cloning Studio Modal
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import type { VoiceProfile } from '../../types';

interface VoiceLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoiceId: string;
  onSelectVoice: (voiceId: string, voiceName: string) => void;
}

export function VoiceLibraryModal({
  isOpen,
  onClose,
  selectedVoiceId,
  onSelectVoice,
}: VoiceLibraryModalProps) {
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);

  // Cloning Form State
  const [showCloneForm, setShowCloneForm] = useState<boolean>(false);
  const [cloneName, setCloneName] = useState<string>('');
  const [cloneGender, setCloneGender] = useState<'Female' | 'Male' | 'Neutral'>('Female');
  const [cloneAccent, setCloneAccent] = useState<string>('American (Conversational)');
  const [cloneTone, setCloneTone] = useState<string>('Warm, professional, and clear');
  const [cloneDesc, setCloneDesc] = useState<string>('');
  const [isCloning, setIsCloning] = useState<boolean>(false);
  const [cloneSuccessMsg, setCloneSuccessMsg] = useState<string | null>(null);

  // Mic Recording State
  const [isRecordingMic, setIsRecordingMic] = useState<boolean>(false);
  const [recordedDuration, setRecordedDuration] = useState<number>(0);
  const [hasRecordedAudio, setHasRecordedAudio] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const fetchVoices = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/voices');
      const data = await res.json();
      if (data.voices && Array.isArray(data.voices)) {
        setVoices(data.voices);
      }
    } catch (err) {
      console.error('Failed to load voice library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchVoices();
    }
  }, [isOpen]);

  const handlePlayPreview = (voiceId: string) => {
    if (activePlayingId === voiceId) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setActivePlayingId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(`/api/voices/${voiceId}/preview?t=${Date.now()}`);
    audioPlayerRef.current = audio;
    setActivePlayingId(voiceId);

    audio.onended = () => {
      setActivePlayingId(null);
    };

    audio.onerror = () => {
      console.warn('Audio preview playback error');
      setActivePlayingId(null);
    };

    audio.play().catch(err => {
      console.warn('Audio play was prevented by browser policy:', err);
      setActivePlayingId(null);
    });
  };

  // Start Mic Recording for Voice Clone
  const startMicRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.start();
      setIsRecordingMic(true);
      setRecordedDuration(0);
      setHasRecordedAudio(false);

      timerRef.current = setInterval(() => {
        setRecordedDuration(prev => {
          if (prev >= 15) {
            stopMicRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      alert(`Microphone access error: ${err.message || 'Permission denied'}`);
    }
  };

  const stopMicRecording = () => {
    if (mediaRecorderRef.current && isRecordingMic) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(timerRef.current);
    setIsRecordingMic(false);
    setHasRecordedAudio(true);
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneName.trim()) {
      alert('Please provide a name for the cloned voice');
      return;
    }

    try {
      setIsCloning(true);
      setCloneSuccessMsg(null);
      const res = await fetch('/api/voices/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cloneName.trim(),
          gender: cloneGender,
          accent: cloneAccent,
          tone: cloneTone,
          description: cloneDesc.trim() || 'Custom cloned voice profile',
        }),
      });

      const data = await res.json();
      if (data.success && data.voice) {
        setCloneSuccessMsg(`🎉 Voice "${data.voice.name}" successfully created!`);
        await fetchVoices();
        onSelectVoice(data.voice.id, data.voice.name);
        setTimeout(() => {
          setShowCloneForm(false);
          setCloneSuccessMsg(null);
          setCloneName('');
          setHasRecordedAudio(false);
        }, 1500);
      } else {
        alert(data.error || 'Failed to clone voice');
      }
    } catch (err: any) {
      alert(`Error cloning voice: ${err.message}`);
    } finally {
      setIsCloning(false);
    }
  };

  const filteredVoices = voices.filter(v => {
    if (filterProvider !== 'all' && v.provider !== filterProvider) return false;
    if (filterGender !== 'all' && v.gender !== filterGender) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.accent.toLowerCase().includes(q) ||
        v.tone.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 14, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          background: '#0d1322',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🎙️</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                Voice Library & Live Cloning Studio
              </h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                Audible sound previews for Cartesia Sonic 3.6, ElevenLabs Turbo, and zero-shot voice clones.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setShowCloneForm(!showCloneForm)}
              style={{
                background: showCloneForm ? 'rgba(255, 255, 255, 0.1)' : 'linear-gradient(135deg, #38bdf8, #0284c7)',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{showCloneForm ? '← Back to Library' : '✨ Clone New Voice'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: '#94a3b8',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1.1rem',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
          {showCloneForm ? (
            /* Voice Cloning Form */
            <form onSubmit={handleCloneSubmit} style={{ maxWidth: '640px', margin: '0 auto' }}>
              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: '12px',
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  marginBottom: '1.5rem',
                }}
              >
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#38bdf8', fontSize: '1rem', fontWeight: 700 }}>
                  🎙️ Instant Zero-Shot Voice Clone
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                  Speak for 5 to 15 seconds to clone your speech prosody, timbre, and acoustic qualities.
                  The generated voice profile will be immediately available across all your voice agents.
                </p>
              </div>

              {cloneSuccessMsg && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    color: '#34d399',
                    fontSize: '0.9rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  {cloneSuccessMsg}
                </div>
              )}

              {/* Mic Capture Section */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '1.25rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  marginBottom: '1.25rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                  {isRecordingMic ? '🔴' : hasRecordedAudio ? '✅' : '🎙️'}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#e2e8f0', marginBottom: '0.25rem' }}>
                  {isRecordingMic
                    ? `Recording Audio Sample... (${recordedDuration}s / 15s)`
                    : hasRecordedAudio
                    ? `Audio Sample Captured (${recordedDuration}s)`
                    : 'Record Live Mic Sample (5-15s)'}
                </div>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                  {isRecordingMic
                    ? 'Please read any sentence in your natural conversational voice...'
                    : 'Click below and speak 1 or 2 natural sentences into your microphone.'}
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={isRecordingMic ? stopMicRecording : startMicRecording}
                    style={{
                      background: isRecordingMic
                        ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                        : 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.65rem 1.4rem',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    {isRecordingMic ? '⏹️ Stop Recording' : hasRecordedAudio ? '🔄 Re-record Sample' : '🎤 Start Recording'}
                  </button>
                </div>
              </div>

              {/* Form Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Voice Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={cloneName}
                    onChange={e => setCloneName(e.target.value)}
                    placeholder="e.g., Alexandra (VIP Concierge)"
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      color: '#f8fafc',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Gender
                  </label>
                  <select
                    value={cloneGender}
                    onChange={e => setCloneGender(e.target.value as any)}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      color: '#f8fafc',
                      fontSize: '0.9rem',
                    }}
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Neutral">Neutral</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Accent / Dialect
                  </label>
                  <input
                    type="text"
                    value={cloneAccent}
                    onChange={e => setCloneAccent(e.target.value)}
                    placeholder="e.g. American (Standard), British (RP), Spanish"
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      color: '#f8fafc',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Tone & Persona
                  </label>
                  <input
                    type="text"
                    value={cloneTone}
                    onChange={e => setCloneTone(e.target.value)}
                    placeholder="e.g. Warm, empathetic, and upbeat"
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      color: '#f8fafc',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Description / Use Case
                </label>
                <textarea
                  rows={2}
                  value={cloneDesc}
                  onChange={e => setCloneDesc(e.target.value)}
                  placeholder="Notes on what kind of calls this voice is calibrated for..."
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '0.65rem 0.85rem',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCloneForm(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#94a3b8',
                    padding: '0.65rem 1.25rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCloning}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.65rem 1.75rem',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isCloning ? 'Synthesizing Clone...' : 'Save & Activate Voice Clone'}
                </button>
              </div>
            </form>
          ) : (
            /* Voice Library Explorer */
            <>
              {/* Search & Filter Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <input
                  type="text"
                  placeholder="Search voices by name, accent, tone..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    flex: '1 1 240px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '0.6rem 0.9rem',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <select
                    value={filterProvider}
                    onChange={e => setFilterProvider(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '0.6rem 0.85rem',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="all">All Providers</option>
                    <option value="cartesia">Cartesia Sonic</option>
                    <option value="elevenlabs">ElevenLabs Turbo</option>
                    <option value="openai">OpenAI Realtime</option>
                    <option value="custom_clone">Custom Clones</option>
                  </select>

                  <select
                    value={filterGender}
                    onChange={e => setFilterGender(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '0.6rem 0.85rem',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="all">All Genders</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Neutral">Neutral</option>
                  </select>
                </div>
              </div>

              {/* Voice Cards Grid */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                  Loading voice library...
                </div>
              ) : filteredVoices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                  No voices match your filters.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1rem' }}>
                  {filteredVoices.map(voice => {
                    const isSelected = selectedVoiceId === voice.id;
                    const isPlaying = activePlayingId === voice.id;

                    const providerColor =
                      voice.provider === 'cartesia'
                        ? '#38bdf8'
                        : voice.provider === 'elevenlabs'
                        ? '#a855f7'
                        : voice.provider === 'custom_clone'
                        ? '#34d399'
                        : '#fbbf24';

                    return (
                      <div
                        key={voice.id}
                        style={{
                          background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected
                            ? '1.5px solid #38bdf8'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          padding: '1.15rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                                {voice.name}
                              </h4>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    color: providerColor,
                                    background: `${providerColor}15`,
                                    border: `1px solid ${providerColor}30`,
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                  }}
                                >
                                  {voice.provider === 'custom_clone' ? 'CUSTOM CLONE' : voice.provider}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  {voice.gender} • {voice.accent}
                                </span>
                              </div>
                            </div>

                            {isSelected && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  background: 'rgba(56, 189, 248, 0.2)',
                                  color: '#38bdf8',
                                  border: '1px solid #38bdf8',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '999px',
                                }}
                              >
                                CURRENT
                              </span>
                            )}
                          </div>

                          <p style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                            {voice.description}
                          </p>

                          <div
                            style={{
                              background: 'rgba(0, 0, 0, 0.25)',
                              borderRadius: '6px',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.75rem',
                              color: '#cbd5e1',
                              fontStyle: 'italic',
                              borderLeft: '2px solid rgba(56, 189, 248, 0.4)',
                            }}
                          >
                            "{voice.sample_text}"
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => handlePlayPreview(voice.id)}
                            style={{
                              background: isPlaying ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                              color: isPlaying ? '#38bdf8' : '#e2e8f0',
                              border: isPlaying ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.12)',
                              padding: '0.45rem 0.9rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                            }}
                          >
                            <span>{isPlaying ? '⏸️ Stop Audio' : '🔊 Listen Sample'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectVoice(voice.id, voice.name);
                              onClose();
                            }}
                            style={{
                              background: isSelected
                                ? 'rgba(255, 255, 255, 0.06)'
                                : 'linear-gradient(135deg, #0284c7, #0369a1)',
                              color: '#ffffff',
                              border: 'none',
                              padding: '0.45rem 1rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {isSelected ? 'Selected' : 'Use This Voice'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
