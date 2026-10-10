// ============================================================================
// Live Conversational Voice Call Modal
// Flow: Agent Speaks First (Greeting) -> Listens to User (STT / Mic) -> Answers Aloud (LLM+TTS) -> Loop
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Agent, PlaygroundTest, CallAnalyticsRecord } from '../../types';

interface LiveVoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
  onRunTest: (input: string) => Promise<PlaygroundTest | undefined>;
  onViewAnalytics?: () => void;
}

type CallPhase = 
  | 'CONNECTING'
  | 'AGENT_SPEAKING_FIRST' // 1. First Tell (Agent speaks initial greeting)
  | 'LISTENING'            // 2. Then Listen Me (Microphone listening to user)
  | 'THINKING'             // 3. Processing LLM & Tools
  | 'AGENT_ANSWERING'      // 4. Then Answer Me (Agent speaks response aloud)
  | 'ENDED';

interface MessageItem {
  id: string;
  sender: 'agent' | 'user';
  text: string;
  timestamp: string;
  audioUrl?: string;
}

const CALL_LANGUAGES = [
  { code: 'en', flag: '🇺🇸', name: 'English' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'ja', flag: '🇯🇵', name: '日本語' },
  { code: 'hi', flag: '🇮🇳', name: 'हिन्दी' },
  { code: 'pt', flag: '🇧🇷', name: 'Português' },
  { code: 'zh', flag: '🇨🇳', name: '中文' },
];

export function LiveVoiceCallModal({
  isOpen,
  onClose,
  agent,
  onRunTest,
  onViewAnalytics,
}: LiveVoiceCallModalProps) {
  const [phase, setPhase] = useState<CallPhase>('CONNECTING');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>('');
  const [audioWaves, setAudioWaves] = useState<number[]>([15, 25, 45, 60, 35, 20]);
  const [analyzingScorecard, setAnalyzingScorecard] = useState<boolean>(false);
  const [scorecardResult, setScorecardResult] = useState<CallAnalyticsRecord | null>(null);

  // Multilingual auto-detection & switching state
  const [currentLang, setCurrentLang] = useState<string>(agent?.default_language || 'en');
  const [autoDetectLang, setAutoDetectLang] = useState<boolean>(agent?.auto_switch_language !== false);
  const [switchNotice, setSwitchNotice] = useState<string | null>(null);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const waveIntervalRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<any>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Auto-scroll messages
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [messages, liveTranscript]);

  // Audio wave animation simulation for active speech
  useEffect(() => {
    if (phase === 'AGENT_SPEAKING_FIRST' || phase === 'AGENT_ANSWERING' || phase === 'LISTENING') {
      waveIntervalRef.current = setInterval(() => {
        setAudioWaves([
          Math.floor(10 + Math.random() * 70),
          Math.floor(15 + Math.random() * 85),
          Math.floor(25 + Math.random() * 95),
          Math.floor(20 + Math.random() * 80),
          Math.floor(10 + Math.random() * 60),
        ]);
      }, 100);
    } else {
      setAudioWaves([10, 15, 20, 15, 10]);
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    }

    return () => {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    };
  }, [phase]);

  // Call duration counter
  useEffect(() => {
    if (isOpen && phase !== 'ENDED') {
      timerIntervalRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isOpen, phase]);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const fallbackSpeak = (text: string, onDone: () => void) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.onend = () => onDone();
      utterance.onerror = () => onDone();
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(onDone, Math.min(3000, text.length * 50));
    }
  };

  // Safe Audio Playback with Cartesia TTS / Web Speech fallback
  const playAgentAudio = useCallback(async (text: string, voiceId?: string): Promise<void> => {
    return new Promise(async (resolve) => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      let audioPlayed = false;

      try {
        const res = await fetch('/api/playground/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice_id: voiceId || agent?.voice_id,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.audio_url) {
            const audio = new Audio(data.audio_url);
            currentAudioRef.current = audio;
            audio.onended = () => {
              currentAudioRef.current = null;
              resolve();
            };
            audio.onerror = () => {
              fallbackSpeak(text, resolve);
            };
            await audio.play();
            audioPlayed = true;
          }
        }
      } catch (e) {
        console.warn('Cartesia playback error in call modal:', e);
      }

      if (!audioPlayed) {
        fallbackSpeak(text, resolve);
      }
    });
  }, [agent]);

  // Stop all audio
  const stopAllAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Browser Speech Recognition Setup
  const stopListening = () => {
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  };

  const startListening = useCallback(() => {
    stopAllAudio();
    stopListening();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setPhase('LISTENING');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setPhase('LISTENING');
      };

      recognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          } else {
            interimText += event.results[i][0].transcript;
          }
        }

        const currentText = (finalText || interimText).trim();
        if (currentText) {
          setLiveTranscript(currentText);

          // Auto-silence debounce: if user pauses speaking for 1.4 seconds, automatically trigger answer!
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = setTimeout(() => {
            handleUserSpoke(currentText);
          }, 1400);
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('SpeechRecognition error:', e.error);
      };

      recognition.onend = () => {
        // Can restart if still in listening phase and not muted
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Failed to start SpeechRecognition:', err);
      setPhase('LISTENING');
    }
  }, []);

  // Handle user's spoken sentence -> Send to Agent -> Agent answers aloud
  const handleUserSpoke = async (spokenText: string) => {
    const textToSend = spokenText.trim();
    if (!textToSend) return;

    // 1. Stop mic and clear silence timer
    stopListening();
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    setLiveTranscript('');

    // 2. Add user message to transcript
    const userMsg: MessageItem = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setMessages(prev => [...prev, userMsg]);

    // 2.5 Multi-Language Auto-Detection & Mid-Call Voice Switching
    if (autoDetectLang) {
      fetch('/api/multilingual/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: textToSend,
          allowed_languages: agent?.languages_supported || ['en', 'es', 'fr', 'de', 'ja', 'hi'],
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.success && data.confidence >= 0.70 && data.language !== currentLang) {
            const target = CALL_LANGUAGES.find(l => l.code === data.language);
            setCurrentLang(data.language);
            setSwitchNotice(`Auto-switched dialect & voice to ${target?.flag || ''} ${target?.name || data.language.toUpperCase()} (${Math.round(data.confidence * 100)}% confidence)`);
            setTimeout(() => setSwitchNotice(null), 6000);
          }
        })
        .catch(() => {});
    }

    // 3. Phase: Thinking
    setPhase('THINKING');

    try {
      // 4. Run test via active agent
      const testResult = await onRunTest(textToSend);
      const answerText = testResult?.output || "I understand. How else can I assist you?";

      // 5. Add agent response to transcript
      const agentMsg: MessageItem = {
        id: `agt_${Date.now()}`,
        sender: 'agent',
        text: answerText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        audioUrl: testResult?.audio_url,
      };
      setMessages(prev => [...prev, agentMsg]);

      // 6. Phase: Agent Answering Aloud (Then Answer Me)
      setPhase('AGENT_ANSWERING');

      // Play answer audio!
      if (testResult?.audio_url) {
        await new Promise<void>((resolve) => {
          const audio = new Audio(testResult.audio_url);
          currentAudioRef.current = audio;
          audio.onended = () => {
            currentAudioRef.current = null;
            resolve();
          };
          audio.onerror = () => {
            playAgentAudio(answerText).then(resolve);
          };
          audio.play().catch(() => {
            playAgentAudio(answerText).then(resolve);
          });
        });
      } else {
        await playAgentAudio(answerText);
      }

      // 7. Loop back: Immediately start listening to user again!
      startListening();
    } catch (err) {
      console.error('Call round error:', err);
      setPhase('LISTENING');
      startListening();
    }
  };

  // Initialize Call Flow: Agent Speaks First (Greeting) -> Then Listen
  useEffect(() => {
    if (!isOpen || !agent) return;

    let isMounted = true;
    setCallDuration(0);
    setMessages([]);
    setLiveTranscript('');
    setPhase('AGENT_SPEAKING_FIRST');
    setAnalyzingScorecard(false);
    setScorecardResult(null);

    // Initialize media recorder for call audio
    audioChunksRef.current = [];
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        audioStreamRef.current = stream;
        try {
          const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
            ? 'audio/webm;codecs=opus'
            : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };
          recorder.start(500);
          mediaRecorderRef.current = recorder;
        } catch (e) {
          console.warn('MediaRecorder init error:', e);
        }
      }).catch(err => {
        console.warn('Microphone stream access for recording:', err);
      });
    }

    const greetingText = agent.greeting || `Hello! I'm ${agent.name}, ${agent.role}. How can I assist you today?`;

    // Add greeting to transcript
    const greetingMsg: MessageItem = {
      id: `greet_${Date.now()}`,
      sender: 'agent',
      text: greetingText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setMessages([greetingMsg]);

    // Speak greeting aloud, then immediately transition to listening!
    playAgentAudio(greetingText, agent.voice_id).then(() => {
      if (isMounted) {
        startListening();
      }
    });

    return () => {
      isMounted = false;
      stopAllAudio();
      stopListening();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [isOpen, agent]);

  // Barge-in / Interrupt Agent
  const handleInterrupt = () => {
    stopAllAudio();
    startListening();
  };

  // End Call & Trigger AI Scorecard Analysis
  const handleEndCall = async () => {
    stopAllAudio();
    stopListening();
    setPhase('ENDED');

    let audioBase64: string | undefined = undefined;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
    }

    if (audioChunksRef.current.length > 0) {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 300) {
          audioBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(audioBlob);
          });
        }
      } catch (e) {
        console.warn('Failed to encode audio recording:', e);
      }
    }

    const hasUserMessages = messages.some(m => m.sender === 'user');
    // If user never spoke or very short test, simply close
    if (!hasUserMessages && messages.length <= 1) {
      setTimeout(() => {
        onClose();
      }, 400);
      return;
    }

    // Call has conversation content: generate AI Post-Call Intelligence Scorecard!
    setAnalyzingScorecard(true);
    try {
      const res = await fetch('/api/calls/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agent?.id,
          agentId: agent?.id,
          agent_name: agent?.name,
          agentName: agent?.name,
          agent_avatar: agent?.avatar,
          agent_role: agent?.role,
          duration_seconds: callDuration || 14,
          durationSeconds: callDuration || 14,
          audio_base64: audioBase64,
          transcripts: messages.map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            text: m.text,
            timestamp: m.timestamp,
          })),
          messages: messages.map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            text: m.text,
            content: m.text,
            timestamp: m.timestamp,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const record = data.record || data.call;
        if (record) {
          setScorecardResult(record);
          setAnalyzingScorecard(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to analyze call scorecard:', err);
    }

    setAnalyzingScorecard(false);
    onClose();
  };

  if (!isOpen || !agent) return null;

  if (analyzingScorecard) {
    return (
      <div className="modal-overlay">
        <div className="voice-call-modal scorecard-loading-modal">
          <div className="scorecard-loading-content">
            <div className="scorecard-pulse-icon">📋</div>
            <div className="scorecard-loading-spinner"></div>
            <h3 style={{ margin: '16px 0 8px 0', color: '#f8fafc', fontSize: '18px' }}>
              Generating Post-Call AI Intelligence...
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', maxWidth: '360px', margin: '0 auto' }}>
              Evaluating conversation sentiment, tool execution accuracy, resolution status, and QA compliance score...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (scorecardResult) {
    return (
      <div className="modal-overlay">
        <div className="voice-call-modal scorecard-modal-dialog">
          <div className="call-header">
            <div className="call-header-agent">
              <span className="call-avatar-pulse">📋</span>
              <div>
                <h2 className="call-agent-name">Post-Call AI Intelligence & QA Scorecard</h2>
                <span className="call-agent-role">
                  Agent: {agent.name} • Call Duration: {formatDuration(scorecardResult.duration_seconds)}
                </span>
              </div>
            </div>
            <button className="call-close-btn" onClick={onClose} title="Close">✕</button>
          </div>

          <div className="scorecard-modal-body">
            {/* Top Score Banner */}
            <div className="scorecard-top-banner">
              <div className="scorecard-big-badge">
                <span className="score-num">{scorecardResult.qa_scores.overall_score}%</span>
                <span className="score-tag">Overall QA Score</span>
              </div>

              <div className="scorecard-meta-chips">
                <span className={`badge badge-sentiment-${scorecardResult.sentiment.toLowerCase()}`}>
                  Sentiment: {scorecardResult.sentiment}
                </span>
                <span className={`badge badge-resolution-${scorecardResult.resolution_status.toLowerCase().replace(/[\s_]+/g, '-')}`}>
                  Status: {scorecardResult.resolution_status}
                </span>
                <span className="badge badge-neutral">
                  Topic: {scorecardResult.topics[0] || 'General Assistance'}
                </span>
              </div>
            </div>

            {/* QA Breakdown Metrics */}
            <div className="scorecard-breakdown-grid">
              <div className="metric-chip">
                <span className="lbl">Empathy & Tone</span>
                <span className="val">{scorecardResult.qa_scores.empathy}%</span>
              </div>
              <div className="metric-chip">
                <span className="lbl">Clarity & Accuracy</span>
                <span className="val">{scorecardResult.qa_scores.clarity}%</span>
              </div>
              <div className="metric-chip">
                <span className="lbl">Tool Execution</span>
                <span className="val">{scorecardResult.qa_scores.tool_accuracy}%</span>
              </div>
              <div className="metric-chip">
                <span className="lbl">Response Latency</span>
                <span className="val">{scorecardResult.qa_scores.response_speed}%</span>
              </div>
            </div>

            {/* AI Summary */}
            <div className="scorecard-summary-box">
              <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Executive AI Summary
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5' }}>
                {scorecardResult.summary}
              </p>
            </div>

            {/* Action Items */}
            {scorecardResult.action_items && scorecardResult.action_items.length > 0 && (
              <div className="scorecard-action-box">
                <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Next Follow-up Action Items
                </h4>
                <ul style={{ margin: 0, paddingLeft: '18px', color: '#e2e8f0', fontSize: '13px' }}>
                  {scorecardResult.action_items.map((item: string, idx: number) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="scorecard-modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Done
            </button>
            {onViewAnalytics && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  onViewAnalytics();
                }}
              >
                Open Full Intelligence Dashboard 📋
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const getPhaseDescription = () => {
    switch (phase) {
      case 'CONNECTING':
        return 'Connecting to Voice Engine...';
      case 'AGENT_SPEAKING_FIRST':
        return `🗣️ ${agent.name} is speaking greeting (First Tell)...`;
      case 'LISTENING':
        return `🎙️ Listening to you... (Speak now)`;
      case 'THINKING':
        return `🧠 ${agent.name} is thinking & checking tools...`;
      case 'AGENT_ANSWERING':
        return `🗣️ ${agent.name} is answering (Then Answer Me)...`;
      case 'ENDED':
        return 'Call ended.';
      default:
        return 'In Call';
    }
  };

  return (
    <div className="modal-overlay">
      <div className="voice-call-modal">
        {/* Call Header */}
        <div className="call-header">
          <div className="call-header-agent">
            <span className="call-avatar-pulse">{agent.avatar || '🤖'}</span>
            <div>
              <h2 className="call-agent-name">{agent.name}</h2>
              <span className="call-agent-role">{agent.role}</span>
            </div>
          </div>
          <div className="call-header-meta">
            {/* Mid-Call Language Selector & Auto-detect indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.2rem 0.5rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <span style={{ fontSize: '0.85rem' }}>🌐</span>
              <select
                style={{
                  background: 'transparent',
                  color: '#93c5fd',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                }}
                value={currentLang}
                onChange={(e) => {
                  const newL = e.target.value;
                  setCurrentLang(newL);
                  const info = CALL_LANGUAGES.find(l => l.code === newL);
                  setSwitchNotice(`Switched to ${info?.flag || ''} ${info?.name || newL.toUpperCase()}`);
                  setTimeout(() => setSwitchNotice(null), 4000);
                }}
                title="Active Spoken Language (Bilingual Switching)"
              >
                {CALL_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code} style={{ background: '#0f172a', color: '#fff' }}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setAutoDetectLang(prev => !prev)}
                style={{
                  background: autoDetectLang ? '#059669' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.1rem 0.35rem',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title={autoDetectLang ? "Auto-detect is ON: switches when caller changes language" : "Auto-detect is OFF"}
              >
                {autoDetectLang ? 'AUTO' : 'MANUAL'}
              </button>
            </div>

            <div className="call-timer-pill">
              <span className="call-timer-dot"></span>
              <span>{formatDuration(callDuration)}</span>
            </div>
            <button className="call-close-btn" onClick={handleEndCall} title="End Call">
              ✕
            </button>
          </div>
        </div>

        {/* Call Visualizer Stage */}
        <div className={`call-stage call-stage-${phase.toLowerCase()}`}>
          <div className="agent-holo-avatar">
            <div className={`holo-ring ${phase.includes('SPEAKING') || phase === 'LISTENING' ? 'holo-ring-active' : ''}`}></div>
            <span className="holo-emoji">{agent.avatar || '🤖'}</span>
          </div>

          <div className="call-phase-status">
            <span className="status-badge">{getPhaseDescription()}</span>
          </div>

          {/* Multilingual Switch Notice Badge */}
          {switchNotice && (
            <div style={{
              background: 'linear-gradient(90deg, rgba(37, 99, 235, 0.95), rgba(16, 185, 129, 0.95))',
              color: '#ffffff',
              padding: '0.35rem 0.85rem',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 600,
              marginTop: '0.3rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            }}>
              <span>🌐</span> {switchNotice}
            </div>
          )}

          {/* Animated Audio Waveform */}
          <div className="call-wave-visualizer">
            {audioWaves.map((height, i) => (
              <div 
                key={i} 
                className={`wave-bar ${phase.includes('SPEAKING') ? 'wave-bar-agent' : phase === 'LISTENING' ? 'wave-bar-user' : ''}`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>

          {/* Real-time User Live Transcript bubble when speaking */}
          {phase === 'LISTENING' && liveTranscript && (
            <div className="live-speech-bubble">
              <span className="mic-icon">🎙️</span>
              <span className="speech-text">"{liveTranscript}"</span>
            </div>
          )}

          {phase === 'LISTENING' && !liveTranscript && (
            <div className="speak-now-hint">
              <span>🎤 Microphone active. Speak naturally into your mic...</span>
            </div>
          )}
        </div>

        {/* Live Conversation Transcript Stream */}
        <div className="call-transcript-container" ref={transcriptScrollRef}>
          <div className="transcript-heading">Conversation Transcript</div>
          {messages.map((msg) => (
            <div key={msg.id} className={`call-msg-row ${msg.sender === 'user' ? 'call-msg-user' : 'call-msg-agent'}`}>
              <div className="call-msg-avatar">
                {msg.sender === 'user' ? '👤' : (agent.avatar || '🤖')}
              </div>
              <div className="call-msg-body">
                <div className="call-msg-sender">
                  {msg.sender === 'user' ? 'You' : agent.name}
                  <span className="call-msg-time">{msg.timestamp}</span>
                </div>
                <div className="call-msg-bubble">
                  {msg.text}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Manual Speech / Fallback Input Bar */}
        <div className="call-input-bar">
          <input
            type="text"
            className="call-text-input"
            placeholder={phase === 'LISTENING' ? "Or type what you want to say..." : "Agent is speaking or processing..."}
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manualInput.trim()) {
                handleUserSpoke(manualInput.trim());
                setManualInput('');
              }
            }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (manualInput.trim()) {
                handleUserSpoke(manualInput.trim());
                setManualInput('');
              }
            }}
            disabled={!manualInput.trim() || phase === 'THINKING'}
          >
            Send ↵
          </button>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="call-quick-prompts">
          <span className="quick-label">Try speaking:</span>
          <button 
            className="quick-pill" 
            onClick={() => handleUserSpoke("What is the weather in Tokyo?")}
          >
            🌤️ "Weather in Tokyo?"
          </button>
          <button 
            className="quick-pill" 
            onClick={() => handleUserSpoke("Can you check booking BK-9842?")}
          >
            📋 "Check booking BK-9842"
          </button>
          <button 
            className="quick-pill" 
            onClick={() => handleUserSpoke("Please transfer my call to Customer Support")}
          >
            📞 "Transfer call"
          </button>
        </div>

        {/* Call Action Controls Bar */}
        <div className="call-actions-bar">
          <button
            className={`btn-call-action ${isMuted ? 'btn-action-muted' : ''}`}
            onClick={() => {
              if (isMuted) {
                setIsMuted(false);
                startListening();
              } else {
                setIsMuted(true);
                stopListening();
              }
            }}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? '🔇 Unmute' : '🎙️ Mic On'}
          </button>

          {(phase === 'AGENT_SPEAKING_FIRST' || phase === 'AGENT_ANSWERING') && (
            <button
              className="btn-call-action btn-action-interrupt"
              onClick={handleInterrupt}
              title="Interrupt agent and speak immediately"
            >
              ⚡ Interrupt (Talk Now)
            </button>
          )}

          {phase === 'LISTENING' && (
            <button
              className="btn-call-action btn-action-done"
              onClick={() => {
                if (liveTranscript) {
                  handleUserSpoke(liveTranscript);
                } else {
                  handleUserSpoke("Hello, can you help me?");
                }
              }}
              title="Finish speaking and request answer"
            >
              ✓ Done Speaking
            </button>
          )}

          <button
            className="btn-call-action btn-action-hangup"
            onClick={handleEndCall}
            title="Hang up call"
          >
            🛑 End Call
          </button>
        </div>
      </div>
    </div>
  );
}
