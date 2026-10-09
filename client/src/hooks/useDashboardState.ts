// ============================================================================
// Dashboard State Hook
// ============================================================================

import { useState, useCallback } from 'react';
import type { DashboardState, PlaygroundConfig, PlaygroundTest, TranscriptMsg, BargeInEvent, ToolCall, MetricsData } from '../types';

const DEFAULT_PLAYGROUND_CONFIG: PlaygroundConfig = {
  voice_id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
  vad_threshold: 0.6,
  vad_sos_debounce_ms: 120,
  vad_eos_timeout_ms: 500,
  system_prompt: `You are a helpful voice assistant. Speak naturally in short, conversational sentences. 
Avoid markdown, emojis, or special formatting. Spell out numbers (e.g., "twenty-five" not "25").
Keep responses concise and spoken-language appropriate. Use contractions and natural fillers.`,
  llm_model: 'gpt-4o-mini',
  llm_temperature: 0.3,
};

export function useDashboardState() {
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    session_id: null,
    turn_id: null,
    transcript_count: 0,
    barge_in_count: 0,
    tool_calls_count: 0,
  });

  const [playgroundConfig, setPlaygroundConfig] = useState<PlaygroundConfig>(DEFAULT_PLAYGROUND_CONFIG);
  const [playgroundTests, setPlaygroundTestsState] = useState<PlaygroundTest[]>([]);
  const [playgroundTestActive, setPlaygroundTestActive] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptMsg[]>([]);
  const [bargeInEvents, setBargeInEvents] = useState<BargeInEvent[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [metrics, setMetrics] = useState<MetricsData>({});

  const setPlaygroundTests = useCallback((val: React.SetStateAction<PlaygroundTest[]>) => {
    setPlaygroundTestsState(prev => {
      const prevArr = Array.isArray(prev) ? prev : [];
      if (typeof val === 'function') {
        const res = (val as (p: PlaygroundTest[]) => PlaygroundTest[])(prevArr);
        return Array.isArray(res) ? res : [];
      }
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'object' && Array.isArray((val as any).tests)) {
        return (val as any).tests;
      }
      return [];
    });
  }, []);

  const addTranscript = useCallback((transcript: TranscriptMsg) => {
    setTranscripts(prev => [...(Array.isArray(prev) ? prev : []), transcript]);
    if (transcript.is_final) {
      setDashboardState(prev => ({ ...prev, transcript_count: prev.transcript_count + 1 }));
    }
  }, []);

  const addBargeIn = useCallback((event: BargeInEvent) => {
    setBargeInEvents(prev => [event, ...(Array.isArray(prev) ? prev : [])]);
    setDashboardState(prev => ({ ...prev, barge_in_count: prev.barge_in_count + 1 }));
  }, []);

  const addToolCall = useCallback((toolCall: ToolCall) => {
    setToolCalls(prev => [toolCall, ...(Array.isArray(prev) ? prev : [])]);
    setDashboardState(prev => ({ ...prev, tool_calls_count: prev.tool_calls_count + 1 }));
  }, []);

  const updateMetrics = useCallback((newMetrics: MetricsData) => {
    setMetrics(newMetrics);
  }, []);

  const updatePlaygroundConfig = useCallback((config: Partial<PlaygroundConfig>) => {
    setPlaygroundConfig(prev => ({ ...prev, ...config }));
  }, []);

  const addPlaygroundTest = useCallback((test: PlaygroundTest) => {
    setPlaygroundTests(prev => [test, ...(Array.isArray(prev) ? prev : [])]);
  }, [setPlaygroundTests]);

  const updatePlaygroundTest = useCallback((testId: string, updates: Partial<PlaygroundTest>) => {
    setPlaygroundTests(prev => (Array.isArray(prev) ? prev : []).map(t => 
      t.test_id === testId ? { ...t, ...updates } : t
    ));
  }, [setPlaygroundTests]);

  const setPlaygroundTestResults = useCallback((tests: PlaygroundTest[]) => {
    setPlaygroundTests(Array.isArray(tests) ? tests : (tests as any)?.tests || []);
  }, [setPlaygroundTests]);

  const rewindTranscripts = useCallback((toIndex: number) => {
    setTranscripts(prev => (Array.isArray(prev) ? prev.slice(0, toIndex + 1) : []));
  }, []);

  const setSessionStart = useCallback((sessionId: string) => {
    setDashboardState(prev => ({ ...prev, session_id: sessionId }));
  }, []);

  return {
    dashboardState,
    setDashboardState,
    playgroundConfig,
    setPlaygroundConfig,
    updatePlaygroundConfig,
    playgroundTests,
    setPlaygroundTests,
    addPlaygroundTest,
    updatePlaygroundTest,
    setPlaygroundTestResults,
    playgroundTestActive,
    setPlaygroundTestActive,
    transcripts,
    setTranscripts,
    addTranscript,
    bargeInEvents,
    setBargeInEvents,
    addBargeIn,
    toolCalls,
    setToolCalls,
    addToolCall,
    metrics,
    setMetrics,
    updateMetrics,
    setSessionStart,
    rewindTranscripts,
  };
}