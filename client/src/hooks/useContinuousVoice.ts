import { DeepgramRecognition, CartesiaSynthesis } from '../utils/cloudSpeech';
import { useEffect, useRef, useState } from 'react';
import { ContinuousVoice, type VoiceState } from '../../../shared/continuousVoice';

export function useContinuousVoice(language: string, onText: (text: string) => void, onInterrupt: () => void, cloud?: { sessionId: string; enabled: boolean; token?: string }, options?: { speakerMode?: boolean; silenceMs?: number; onPlayback?: (audio: HTMLAudioElement) => void }) {
  const [state, setState] = useState<VoiceState>({ phase: 'idle', active: false, partial: '', error: '' });
  const cloudRef = useRef(cloud); cloudRef.current = cloud;
  const optionsRef = useRef(options); optionsRef.current = options;
  const synthesis = useRef<CartesiaSynthesis>(); synthesis.current ||= new CartesiaSynthesis(() => cloudRef.current?.sessionId || '', () => cloudRef.current?.token, audio => optionsRef.current?.onPlayback?.(audio));
  const callbacks = useRef({ onText, onInterrupt }); callbacks.current = { onText, onInterrupt };
  const mounted = useRef(true); const controller = useRef<ContinuousVoice>();
  const get = () => controller.current ||= new ContinuousVoice({
    recognition: () => { if (cloudRef.current?.enabled && !cloudRef.current.token) return new DeepgramRecognition(cloudRef.current.sessionId); const API = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!API) throw new Error('Unsupported'); return new API(); },
    utterance: text => new SpeechSynthesisUtterance(text),
    synthesis: { cancel: () => { synthesis.current?.cancel(); window.speechSynthesis?.cancel(); }, speak: speech => { if (cloudRef.current?.enabled) { synthesis.current!.speak(speech); return; } if (!window.speechSynthesis) throw new Error('Unsupported'); window.speechSynthesis.speak(speech); } },
    changed: value => { if (mounted.current) setState(value); },
    text: text => callbacks.current.onText(text), interrupt: () => callbacks.current.onInterrupt(),
  }, language, optionsRef.current);
  useEffect(() => {
    if (controller.current && options?.speakerMode !== undefined) {
      controller.current.setSpeakerMode(options.speakerMode);
    }
  }, [options?.speakerMode]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.dispose(); controller.current = undefined; }; }, [language, cloud?.sessionId, cloud?.enabled]);
  return { ...state, start: (greeting?: string) => get().start(greeting), pause: () => controller.current?.pause(), thinking: () => get().thinking(), speak: (text: string) => get().speak(text), recover: () => controller.current?.recover(), setSpeakerMode: (enabled: boolean) => controller.current?.setSpeakerMode(enabled) };
}

