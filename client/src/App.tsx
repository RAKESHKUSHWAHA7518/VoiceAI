// ============================================================================
// Main App Component
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link, Navigate, Route, Routes, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { PAGE_NAMES, PAGE_ROUTES } from './routes';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { AgentsTab } from './components/agents/AgentsTab';
import { MonitorTab } from './components/monitor/MonitorTab';
import { PlaygroundTab } from './components/playground/PlaygroundTab';
import { InspectorTab } from './components/inspector/InspectorTab';
import { LiveVoiceCallModal } from './components/voice/LiveVoiceCallModal';
import { AnalyticsTab } from './components/analytics/AnalyticsTab';
import { TelephonyTab } from './components/telephony/TelephonyTab';
import { KnowledgeTab } from './components/knowledge/KnowledgeTab';
import { CampaignsTab } from './components/campaigns/CampaignsTab';
import { HITLTab } from './components/hitl/HITLTab';
import { EvalsTab } from './components/evals/EvalsTab';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioLevels } from './hooks/useAudioLevels';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useDashboardState } from './hooks/useDashboardState';
import type { TabName, Agent } from './types';
import './index.css';
import './studio.css';

function App() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeTab = PAGE_NAMES.find(page => matchPath({ path: PAGE_ROUTES[page].path, end: true }, pathname)) ?? null;
  const navigateToPage = useCallback((page: TabName) => {
    const path = PAGE_ROUTES[page].path;
    if (pathname !== path) navigate(path);
  }, [navigate, pathname]);
  useEffect(() => {
    document.title = `${activeTab ? PAGE_ROUTES[activeTab].title : 'Page not found'} | VoiceAI`;
    setNavigationOpen(false);
  }, [activeTab]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState('');
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [isCreatingNewAgent, setIsCreatingNewAgent] = useState<boolean>(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState<boolean>(false);
  const [callAgent, setCallAgent] = useState<Agent | null>(null);

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
    rewindTranscripts,
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

  const { playPcmChunk, stopAndFlush } = useAudioPlayer(24000);

  const handleAudioFrame = useCallback((pcmChunk: Uint8Array) => {
    playPcmChunk(pcmChunk);
    try {
      const view = new Int16Array(pcmChunk.buffer, pcmChunk.byteOffset, pcmChunk.byteLength / 2);
      let sum = 0;
      const step = Math.max(1, Math.floor(view.length / 32));
      let count = 0;
      for (let i = 0; i < view.length; i += step) {
        sum += Math.abs(view[i]);
        count++;
      }
      const avg = count > 0 ? (sum / count) / 32768 : 0;
      pushAgent(Math.min(1.0, avg * 3.0));
    } catch {
      pushAgent(0.4);
    }
  }, [playPcmChunk, pushAgent]);

  const handleBargeIn = useCallback((evt: any) => {
    addBargeIn(evt);
    stopAndFlush();
    pushAgent(0);
  }, [addBargeIn, stopAndFlush, pushAgent]);

  const handleFlushBuffer = useCallback(() => {
    stopAndFlush();
    pushAgent(0);
  }, [stopAndFlush, pushAgent]);

  const wsUrl = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname || 'localhost'}:8000/ws`
    : 'ws://localhost:8000/ws';

  const {
    connected,
    sendControl,
    sendAudioChunk,
  } = useWebSocket({
    url: wsUrl,
    onTranscript: addTranscript,
    onBargeIn: handleBargeIn,
    onAudioFrame: handleAudioFrame,
    onFlushBuffer: handleFlushBuffer,
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

  const handleRewind = useCallback(async (turnIndex: number) => {
    rewindTranscripts(turnIndex);
    if (sendControl) {
      sendControl('rewind', { turnIndex });
    }
    if (dashboardState.session_id) {
      try {
        await fetch(`/api/sessions/${dashboardState.session_id}/rewind`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnIndex }),
        });
      } catch (e) {
        console.warn('Session rewind error:', e);
      }
    }
  }, [rewindTranscripts, sendControl, dashboardState.session_id]);

  const handleSelectAgent = useCallback((agent: Agent) => {
    setActiveAgent(agent);
    setPlaygroundConfig(prev => ({
      ...prev,
      voice_id: agent.voice_id,
      system_prompt: agent.system_prompt,
      llm_model: agent.llm_model,
      llm_temperature: agent.llm_temperature,
    }));
  }, [setPlaygroundConfig]);

  const handleSaveAgent = useCallback(async (agentData: Partial<Agent>) => {
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData),
      });
      if (!res.ok) throw new Error('Could not save your agent. Please try again.');
      const data = await res.json();
      if (data.agents) {
        setAgents(data.agents);
        if (data.agent) {
          handleSelectAgent(data.agent);
        }
      }
    } catch (err) {
      console.error('Failed to save agent:', err);
      throw err;
    }
  }, [handleSelectAgent]);

  const handleDeleteAgent = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete your agent. Please try again.');
      const data = await res.json();
      if (data.agents) {
        setAgents(data.agents);
        if (activeAgent?.id === agentId && data.agents.length > 0) {
          handleSelectAgent(data.agents[0]);
        }
      }
    } catch (err) {
      console.error('Failed to delete agent:', err);
      throw err;
    }
  }, [activeAgent, handleSelectAgent]);

  const handleTestAgent = useCallback((agent: Agent) => {
    handleSelectAgent(agent);
    navigateToPage('playground');
  }, [handleSelectAgent, navigateToPage]);

  const handleStartVoiceCall = useCallback((agentToCall?: Agent | null) => {
    const target = agentToCall || activeAgent;
    if (target) {
      setCallAgent(target);
      handleSelectAgent(target);
      setIsCallModalOpen(true);
    }
  }, [activeAgent, handleSelectAgent]);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentsError('');
    try {
      const response = await fetch('/api/agents');
      if (!response.ok) throw new Error('Unable to load agents');
      const data = await response.json();
      if (!Array.isArray(data.agents)) throw new Error('Invalid agent response');
      setAgents(data.agents);
      if (data.agents.length) handleSelectAgent(data.agents[0]);
      else setActiveAgent(null);
    } catch {
      setAgentsError('We couldn’t load your agents. Check your connection and try again.');
    } finally {
      setAgentsLoading(false);
    }
  }, [handleSelectAgent]);

  useEffect(() => { void loadAgents(); }, [loadAgents]);

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

  const runPlaygroundTestWithInput = useCallback(async (input: string) => {
    if (!input.trim()) return;

    setPlaygroundTestActive(true);
    try {
      const res = await fetch('/api/playground/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: input,
          agent_id: activeAgent?.id,
          agent_name: activeAgent?.name,
          voice_id: playgroundConfig.voice_id,
          system_prompt: playgroundConfig.system_prompt,
          llm_model: playgroundConfig.llm_model,
          llm_temperature: playgroundConfig.llm_temperature,
          assigned_tools: activeAgent?.assigned_tools,
        }),
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
  }, [setPlaygroundTests, setPlaygroundTestActive, addTranscript, addToolCall, updateMetrics, playVoice, activeAgent, playgroundConfig]);

  const renderTabContent = useCallback((page: TabName) => {
    switch (page) {
      case 'agents':
        return (
          <AgentsTab
            loading={agentsLoading}
            error={agentsError}
            onRetry={loadAgents}
            agents={agents}
            activeAgent={activeAgent}
            onSelectAgent={handleSelectAgent}
            onSaveAgent={handleSaveAgent}
            onDeleteAgent={handleDeleteAgent}
            onTestAgent={handleTestAgent}
            onStartVoiceCall={handleStartVoiceCall}
            isCreatingNew={isCreatingNewAgent}
            setIsCreatingNew={setIsCreatingNewAgent}
          />
        );
      case 'playground':
        return (
          <PlaygroundTab
            config={playgroundConfig}
            setConfig={setPlaygroundConfig}
            tests={playgroundTests}
            sendControl={sendControl}
            sendAudioChunk={sendAudioChunk}
            onStopAudio={stopAndFlush}
            onRunTest={runPlaygroundTestWithInput}
            onPlayVoice={playVoice}
            testActive={playgroundTestActive}
            activeAgent={activeAgent}
            agents={agents}
            onSelectAgent={handleSelectAgent}
            onStartVoiceCall={handleStartVoiceCall}
          />
        );
      case 'campaigns':
        return (
          <CampaignsTab
            agents={agents}
            onStartVoiceCall={handleStartVoiceCall}
          />
        );
      case 'knowledge':
        return (
          <KnowledgeTab
            agents={agents}
            activeAgent={activeAgent}
            playVoice={playVoice}
          />
        );
      case 'evals':
        return (
          <EvalsTab
            agents={agents}
          />
        );
      case 'hitl':
        return (
          <HITLTab
            agents={agents}
            playVoice={playVoice}
          />
        );
      case 'telephony':
        return (
          <TelephonyTab
            agents={agents}
            onStartVoiceCall={handleStartVoiceCall}
          />
        );
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
      case 'inspector':
        return (
          <InspectorTab
            transcripts={transcripts}
            bargeInEvents={bargeInEvents}
            toolCalls={toolCalls}
            onRewind={handleRewind}
          />
        );
      case 'analytics':
        return (
          <AnalyticsTab
            agents={agents}
            onStartVoiceCall={handleStartVoiceCall}
          />
        );
      default:
        return null;
    }
  }, [
    agentsLoading,
    agentsError,
    loadAgents,
    agents,
    activeAgent,
    handleSelectAgent,
    handleSaveAgent,
    handleDeleteAgent,
    handleTestAgent,
    handleStartVoiceCall,
    handleRewind,
    isCreatingNewAgent,
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
    playVoice,
    sendControl,
    sendAudioChunk,
    stopAndFlush,
    setPlaygroundConfig,
  ]);

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar
        open={navigationOpen}
        onClose={closeNavigation}
        agents={agents}
        activeAgent={activeAgent}
        onSelectAgent={handleSelectAgent}
        onCreateAgent={() => {
          navigateToPage('agents');
          setIsCreatingNewAgent(true);
        }}
        connected={connected}
        dashboardState={dashboardState}
      />
      <div className="main-wrapper">
        <TopBar
          navigationOpen={navigationOpen}
          onToggleNavigation={() => setNavigationOpen(open => !open)}
          activeTab={activeTab}
          activeAgent={activeAgent}
          onOpenAgentsTab={() => navigateToPage('agents')}
          onStartVoiceCall={() => handleStartVoiceCall(activeAgent)}
          connected={connected}
        />
        <main id="main-content" tabIndex={-1} className="content-container" data-page={activeTab || 'not-found'}>
          <Routes>
            <Route path="/" element={<Navigate to={PAGE_ROUTES.agents.path} replace />} />
            {PAGE_NAMES.map(page => (
              <Route key={page} path={PAGE_ROUTES[page].path} element={renderTabContent(page)} />
            ))}
            <Route path="*" element={
              <section>
                <h2>Page not found</h2>
                <p>The page you requested does not exist.</p>
                <Link to={PAGE_ROUTES.agents.path} className="btn btn-primary">Go to Agents Studio</Link>
              </section>
            } />
          </Routes>
        </main>
      </div>

      <LiveVoiceCallModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        agent={callAgent || activeAgent}
        onRunTest={runPlaygroundTestWithInput}
        onViewAnalytics={() => {
          setIsCallModalOpen(false);
          navigateToPage('analytics');
        }}
      />
    </div>
  );
}

export default App;
