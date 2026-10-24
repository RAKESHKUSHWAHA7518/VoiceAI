import { useEffect, useRef, useState } from 'react';
import type { VoiceProfile } from '../../types';
interface VoiceLibraryModalProps {
  isOpen: boolean; onClose: () => void; selectedVoiceId: string;
  onSelectVoice: (voiceId: string, voiceName: string) => void;
}
export function VoiceLibraryModal({ isOpen, onClose, selectedVoiceId, onSelectVoice }: VoiceLibraryModalProps) {
  const [voices, setVoices] = useState<VoiceProfile[]>([]); const [query, setQuery] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null; const controller = new AbortController();
    setLoading(true); setError(''); dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    fetch('/api/voices', { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error('Could not load voices.'); setVoices(data.voices); }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); previous?.focus(); };
  }, [isOpen]);
  if (!isOpen) return null;
  return <div className="modal-overlay"><div className="modal-card" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="voice-library-title" onKeyDown={event => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'Tab') { const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,input') || []); const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}><div className="modal-header"><h2 id="voice-library-title">Voice catalog</h2><button className="btn btn-secondary" onClick={onClose}>Close</button></div><div style={{ padding: 24, maxHeight: '65vh', overflowY: 'auto' }}><p>Choose a provider voice for future audio deployment. The current browser preview uses your device voice. Voice cloning is not enabled.</p><input className="form-input" aria-label="Search voices" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search voice names" />{error && <p role="alert">{error}</p>}{loading && <p role="status">Loading voices...</p>}{voices.filter(voice => voice.name.toLowerCase().includes(query.toLowerCase())).map(voice => <div key={voice.id} style={{ padding: '14px 0', borderBottom: '1px solid #ddd' }}><strong>{voice.name}</strong><p>{voice.provider} · {voice.description}</p><button className="btn btn-secondary" aria-pressed={voice.id === selectedVoiceId} onClick={() => { onSelectVoice(voice.id, voice.name); onClose(); }}>{voice.id === selectedVoiceId ? 'Selected' : 'Choose voice'}</button></div>)}</div></div></div>;
}
