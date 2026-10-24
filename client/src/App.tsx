// ============================================================================
// Main App Component
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate, Route, Routes, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { PAGE_NAMES, PAGE_ROUTES } from './routes';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { AgentsTab } from './components/agents/AgentsTab';
import { WorkspaceObserve } from './components/monitor/WorkspaceObserve';
import { CalendarWidget } from './components/calendar/CalendarWidget';
import { FeatureRegister } from './components/layout/FeatureRegister';
import { PlaygroundTab } from './components/playground/PlaygroundTab';

import { LiveVoiceCallModal } from './components/voice/LiveVoiceCallModal';
import { ConversationHistory } from './components/analytics/ConversationHistory';
import { TelephonyTab } from './components/telephony/TelephonyTab';
import { KnowledgeTab } from './components/knowledge/KnowledgeTab';
import { CampaignsTab } from './components/campaigns/CampaignsTab';
import { HITLTab } from './components/hitl/HITLTab';
import { EvalsTab } from './components/evals/EvalsTab';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioLevels } from './hooks/useAudioLevels';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useDashboardState } from './hooks/useDashboardState';
import type { TabName, Agent, PlaygroundTest } from './types';
import './index.css';
import './studio.css';
import './workflows.css';
import './showcase.css';
import { AuthGate, WORKSPACE_PAGES } from './components/auth/AuthGate';
import { openConversation, streamTurn, endConversation } from './utils/conversation';
import { PublicWidget } from './components/voice/PublicWidget';
import { WidgetPreview } from './components/voice/WidgetPreview';

function StudioApp() {
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
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [activeTab]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState('');
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [isCreatingNewAgent, setIsCreatingNewAgent] = useState<boolean>(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState<boolean>(false);
  const [callAgent, setCallAgent] = useState<Agent | null>(null);
  const playgroundRequest = useRef<AbortController | null>(null);
  const [playgroundMode, setPlaygroundMode] = useState<string>('');
  const playgroundSession = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => () => { playgroundRequest.current?.abort(); if (playgroundSession.current) void endConversation(playgroundSession.current.id).catch(() => {}); }, []);

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

  const wsUrl = ''; // Private streaming sessions arrive with the runtime phase.

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
        if (activeAgent?.id === agentId) {
          if (data.agents.length > 0) handleSelectAgent(data.agents[0]);
          else setActiveAgent(null);
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

  const stopPlayground = useCallback(() => {
    playgroundRequest.current?.abort(); playgroundRequest.current = null;
    const previous = playgroundSession.current; playgroundSession.current = null;
    if (previous) void endConversation(previous.id).catch(() => {});
    setPlaygroundTestActive(false);
    stopAndFlush(); window.speechSynthesis?.cancel();
    setPlaygroundTests(previousTests => previousTests.map(test => test.status === 'running' ? { ...test, status: 'error', error: 'Stopped. The next message starts a fresh conversation.' } : test));
  }, [setPlaygroundTestActive, setPlaygroundTests, stopAndFlush]);
  const newPlayground = useCallback(() => {
    stopPlayground(); setPlaygroundMode('');
    setPlaygroundTests(previous => previous.filter(test => test.agent_id !== activeAgent?.id));
  }, [stopPlayground, activeAgent?.id, setPlaygroundTests]);
  useEffect(() => { stopPlayground(); setPlaygroundMode(''); }, [activeAgent, pathname, stopPlayground]);
  const runPlaygroundTestWithInput = useCallback(async (input: string) => {
    if (!input.trim() || !activeAgent || playgroundRequest.current) return;
    const controller = new AbortController(); playgroundRequest.current = controller;
    const testId = crypto.randomUUID();
    const pending: PlaygroundTest = { test_id: testId, timestamp: Date.now(), input, output: '', agent_id: activeAgent.id, agent_name: activeAgent.name, config_snapshot: { ...structuredClone(activeAgent) }, status: 'running', tool_events: [] };
    setPlaygroundTests(previous => [pending, ...previous]); setPlaygroundTestActive(true);
    const patch = (changes: Partial<PlaygroundTest>) => { if (playgroundRequest.current === controller) setPlaygroundTests(previous => previous.map(test => test.test_id === testId ? { ...test, ...changes } : test)); };
    try {
      const key = JSON.stringify(activeAgent);
      if (playgroundSession.current?.key !== key) {
        const previous = playgroundSession.current; playgroundSession.current = null;
        if (previous) await endConversation(previous.id);
        const opened = await openConversation(activeAgent.id, controller.signal);
        if (controller.signal.aborted) { void endConversation(opened.session_id); return; }
        playgroundSession.current = { key, id: opened.session_id }; setPlaygroundMode(opened.runtime_mode);
      }
      let output = ''; const toolEvents: NonNullable<PlaygroundTest['tool_events']> = [];
      const turn = await streamTurn(playgroundSession.current!.id, input, delta => { output += delta; patch({ output }); }, controller.signal, undefined, event => { toolEvents.push(event); patch({ tool_events: [...toolEvents] }); });
      if (controller.signal.aborted || playgroundRequest.current !== controller) return;
      const result: PlaygroundTest = { ...pending, test_id: testId, output: turn.output, status: 'completed', latency_ms: Math.round(turn.metrics.processing_ms), tool_events: turn.tool_events, sources: turn.sources, runtime_mode: turn.runtime_mode };
      patch(result);
      addTranscript({ role: 'user', text: input, is_final: true, timestamp: Date.now() });
      addTranscript({ role: 'assistant', text: turn.output, is_final: true, timestamp: Date.now() });
      return result;
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'The conversation failed. Please retry.';
      patch({ status: 'error', error: message });
      const previous = playgroundSession.current; playgroundSession.current = null;
      if (previous) void endConversation(previous.id).catch(() => {});
      return { ...pending, status: 'error' as const, error: message };
    } finally {
      if (playgroundRequest.current === controller) { playgroundRequest.current = null; setPlaygroundTestActive(false); }
    }
  }, [activeAgent, setPlaygroundTests, setPlaygroundTestActive, addTranscript]);

  const renderTabContent = useCallback((page: TabName) => {
    if (!WORKSPACE_PAGES.has(page)) return <section className="phase-notice"><h2>This feature is being prepared</h2><p>Your private workspace supports agents, knowledge and playground testing. More features will appear as their implementation phases are completed.</p><Link to="/agents">Back to your agents</Link></section>;
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
            onOpenKnowledge={id => { const agent = agents.find(value => value.id === id); if (agent) handleSelectAgent(agent); navigate('/knowledge?agent=' + encodeURIComponent(id)); }}
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
            onStopTest={stopPlayground}
            onNewConversation={newPlayground}
            runtimeMode={playgroundMode}
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
            onSelectAgent={handleSelectAgent}
            onTestAgent={handleTestAgent}
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
      case 'monitor': return <WorkspaceObserve mode="monitor" agents={agents} />;
      case 'inspector': return <WorkspaceObserve mode="inspector" agents={agents} />;
      case 'reports': return <WorkspaceObserve mode="reports" agents={agents} />;
      case 'calendar': return <div className="conversation-history-page"><h2>Appointments</h2><p>Manual workspace calendar. Booking through agent tools remains a separate integration.</p><CalendarWidget /></div>;
      case 'features': return <FeatureRegister />;
      case 'analytics':
        return <ConversationHistory />;
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
    stopPlayground, newPlayground, playgroundMode,
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
              <Route key={page} path={PAGE_ROUTES[page].path} element={<>{['campaigns','evals','hitl','telephony'].includes(page) && <div className="feature-notice" role="note"><strong>Local workspace simulation</strong><p>Campaign dialing, evaluation scores, supervisor audio actions and telephone calls on these showcase screens are simulations. They make no carrier call or provider request. Campaign, evaluation and handoff demo state resets after server restart. Your saved agents, phone registry and appointments remain private.</p><Link to="/features">See every feature and its status →</Link></div>}{renderTabContent(page)}</>} />
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

export default function App() { return window.location.pathname.startsWith('/widget/') ? <PublicWidget /> : window.location.pathname.startsWith('/preview/') ? <WidgetPreview /> : <AuthGate><StudioApp /></AuthGate>; }
