// ============================================================================
// Live Conversational Voice Call Modal
// Flow: Agent Speaks First (Greeting) -> Listens to User (STT / Mic) -> Answers Aloud (LLM+TTS) -> Loop
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Agent, PlaygroundTest } from '../../types';

interface LiveVoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
  onRunTest: (input: string) => Promise<PlaygroundTest | undefined>;
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

export function LiveVoiceCallModal({
  isOpen,
  onClose,
  agent,
  onRunTest,
}: LiveVoiceCallModalProps) {
  const [phase, setPhase] = useState<CallPhase>('CONNECTING');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>('');
  const [audioWaves, setAudioWaves] = useState<number[]>([15, 25, 45, 60, 35, 20]);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const waveIntervalRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<any>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

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
    };
  }, [isOpen, agent]);

  // Barge-in / Interrupt Agent
  const handleInterrupt = () => {
    stopAllAudio();
    startListening();
  };

  // End Call
  const handleEndCall = () => {
    stopAllAudio();
    stopListening();
    setPhase('ENDED');
    setTimeout(() => {
      onClose();
    }, 400);
  };

  if (!isOpen || !agent) return null;

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
