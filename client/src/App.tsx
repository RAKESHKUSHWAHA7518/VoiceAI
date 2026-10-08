// ============================================================================
// Main App Component
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { Tabs } from './components/layout/Tabs';
import { MonitorTab } from './components/monitor/MonitorTab';
import { PlaygroundTab } from './components/playground/PlaygroundTab';
import { InspectorTab } from './components/inspector/InspectorTab';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioLevels } from './hooks/useAudioLevels';
import { useDashboardState } from './hooks/useDashboardState';
import type { TabName } from './types';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState<TabName>('monitor');
  const { 
    userLevel, 
    agentLevel,
    pushAgent,
  } = useAudioLevels();
  
  const {
    dashboardState,
    setDashboardState,
    playgroundConfig,
    setPlaygroundConfig,
    playgroundTests,
    setPlaygroundTests,
    addPlaygroundTest,
    updatePlaygroundTest,
    setPlaygroundTestResults,
    playgroundTestActive,
    setPlaygroundTestActive,
    transcripts,
    addTranscript,
    bargeInEvents,
    addBargeIn,
    toolCalls,
    addToolCall,
    metrics,
    updateMetrics,
    setSessionStart,
  } = useDashboardState();

  const fallbackSpeech = useCallback((text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      const interval = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          pushAgent(0.3 + Math.random() * 0.5);
        } else {
          pushAgent(0);
          clearInterval(interval);
        }
      }, 80);
      utterance.onend = () => {
        clearInterval(interval);
        pushAgent(0);
      };
      window.speechSynthesis.speak(utterance);
    }
  }, [pushAgent]);

  const playVoice = useCallback((text: string, audioUrl?: string) => {
    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        const interval = setInterval(() => {
          if (!audio.paused && !audio.ended) {
            pushAgent(0.3 + Math.random() * 0.6);
          } else {
            pushAgent(0);
            clearInterval(interval);
          }
        }, 80);
        audio.onended = () => {
          clearInterval(interval);
          pushAgent(0);
        };
        audio.onerror = () => {
          clearInterval(interval);
          pushAgent(0);
          fallbackSpeech(text);
        };
        audio.play().catch(err => {
          console.warn('Audio play error, falling back to Web Speech:', err);
          clearInterval(interval);
          pushAgent(0);
          fallbackSpeech(text);
        });
        return;
      } catch (e) {
        console.error('Audio init error:', e);
      }
    }
    fallbackSpeech(text);
  }, [pushAgent, fallbackSpeech]);

  const wsUrl = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname || 'localhost'}:8000/ws`
    : 'ws://localhost:8000/ws';

  const {
    connected,
    sendControl,
  } = useWebSocket({
    url: wsUrl,
    onTranscript: addTranscript,
    onBargeIn: addBargeIn,
    onToolCall: addToolCall,
    onMetrics: updateMetrics,
    onSessionStart: setSessionStart,
    onPlaygroundConfig: (config) => setPlaygroundConfig(config),
    onPlaygroundTestStart: addPlaygroundTest,
    onPlaygroundTestComplete: (test) => updatePlaygroundTest(test.test_id, test),
    onPlaygroundTestResults: setPlaygroundTestResults,
    onDashboardState: setDashboardState,
    onError: (error) => console.error('WebSocket error:', error),
  });

  // Fetch initial data
  useEffect(() => {
    fetch('/api/playground/config')
      .then(r => r.json())
      .then(config => setPlaygroundConfig(config))
      .catch(console.error);

    fetch('/api/playground/history?limit=50')
      .then(r => r.json())
      .then(data => {
        const tests = Array.isArray(data) ? data : (data?.tests || []);
        setPlaygroundTests(tests);
      })
      .catch(console.error);

    // Immediate and recurring polling for metrics and state
    const loadMetricsAndState = () => {
      fetch('/api/metrics/percentiles?window=1000')
        .then(r => r.json())
        .then(data => {
          const m = data.percentiles || data;
          if (m) {
            updateMetrics({
              ...m,
              tts_first_chunk_p50: m.tts_first_chunk_p50 ?? m.tts_p50,
              tts_first_chunk_p95: m.tts_first_chunk_p95 ?? m.tts_p95,
            });
          }
        })
        .catch(console.error);

      fetch('/api/state')
        .then(r => r.json())
        .then(state => setDashboardState(state))
        .catch(console.error);
    };

    loadMetricsAndState();
    const interval = setInterval(loadMetricsAndState, 5000);

    return () => clearInterval(interval);
  }, [setPlaygroundConfig, setPlaygroundTests, updateMetrics, setDashboardState]);

  const savePlaygroundConfig = useCallback(() => {
    sendControl('update_playground_config', { config: playgroundConfig });
  }, [sendControl, playgroundConfig]);

  const runPlaygroundTestWithInput = useCallback(async (input: string) => {
    if (!input.trim()) return;

    setPlaygroundTestActive(true);
    try {
      const res = await fetch('/api/playground/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      });
      const data = await res.json();

      if (!res.ok || data.success === false) {
        const errorMsg = data.error?.message || `Request failed (${res.status})`;
        const errorTest = {
          test_id: 'err_' + Date.now().toString(36),
          timestamp: Date.now(),
          input: input,
          config_snapshot: {},
          output: `⚠️ ${errorMsg}`,
          status: 'error' as const,
          latency_ms: 0,
        };
        setPlaygroundTests(prev => [errorTest, ...(Array.isArray(prev) ? prev : [])]);
        return errorTest;
      }

      if (data.test) {
        setPlaygroundTests(prev => [data.test, ...(Array.isArray(prev) ? prev : [])]);
        addTranscript({
          role: 'user',
          text: data.test.input,
          is_final: true,
          timestamp: data.test.timestamp || Date.now(),
        });
        if (data.test.output) {
          addTranscript({
            role: 'assistant',
            text: data.test.output,
            is_final: true,
            timestamp: (data.test.timestamp || Date.now()) + 0.1,
          });
          playVoice(data.test.output, data.test.audio_url);
        }

        if (Array.isArray(data.test.tool_calls)) {
          data.test.tool_calls.forEach((tc: any) => addToolCall(tc));
        }
      }

      if (data.metrics) {
        updateMetrics(data.metrics);
      }
      return data.test;
    } catch (e) {
      console.error('Test failed:', e);
      const fallbackErr = {
        test_id: 'err_' + Date.now().toString(36),
        timestamp: Date.now(),
        input: input,
        config_snapshot: {},
        output: '⚠️ Network or server error occurred',
        status: 'error' as const,
        latency_ms: 0,
      };
      setPlaygroundTests(prev => [fallbackErr, ...(Array.isArray(prev) ? prev : [])]);
      return fallbackErr;
    } finally {
      setPlaygroundTestActive(false);
    }
  }, [setPlaygroundTests, setPlaygroundTestActive, addTranscript, addToolCall, updateMetrics, playVoice]);

  const renderTabContent = useCallback(() => {
    switch (activeTab) {
      case 'monitor':
        return (
          <MonitorTab
            metrics={metrics}
            transcripts={transcripts}
            bargeInEvents={bargeInEvents}
            toolCalls={toolCalls}
            audioLevelUser={userLevel}
            audioLevelAgent={agentLevel}
          />
        );
      case 'playground':
        return (
          <PlaygroundTab
            config={playgroundConfig}
            setConfig={setPlaygroundConfig}
            tests={playgroundTests}
            sendControl={sendControl}
            onRunTest={runPlaygroundTestWithInput}
            onPlayVoice={playVoice}
            testActive={playgroundTestActive}
          />
        );
      case 'inspector':
        return (
          <InspectorTab
            transcripts={transcripts}
            bargeInEvents={bargeInEvents}
            toolCalls={toolCalls}
          />
        );
      default:
        return null;
    }
  }, [
    activeTab,
    connected,
    dashboardState,
    metrics,
    transcripts,
    bargeInEvents,
    toolCalls,
    playgroundConfig,
    playgroundTests,
    playgroundTestActive,
    userLevel,
    agentLevel,
    runPlaygroundTestWithInput,
    savePlaygroundConfig,
  ]);

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      <Header connected={connected} dashboardState={dashboardState} />
      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
      <main style={{ padding: '1.5rem', maxWidth: '1800px', margin: '0 auto' }}>
        {renderTabContent()}
      </main>
    </div>
  );
}

export default App;