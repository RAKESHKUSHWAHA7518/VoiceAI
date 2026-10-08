// ============================================================================
// Audio Levels Hook
// ============================================================================

import { useRef, useState, useCallback } from 'react';

const BUFFER_SIZE = 50;

export function useAudioLevels() {
  const userRef = useRef<number[]>(Array(BUFFER_SIZE).fill(0));
  const agentRef = useRef<number[]>(Array(BUFFER_SIZE).fill(0));
  const [userLevel, setUserLevel] = useState<number[]>(Array(BUFFER_SIZE).fill(0));
  const [agentLevel, setAgentLevel] = useState<number[]>(Array(BUFFER_SIZE).fill(0));

  const pushUser = useCallback((value: number) => {
    userRef.current = [...userRef.current.slice(1), value];
    setUserLevel([...userRef.current]);
  }, []);

  const pushAgent = useCallback((value: number) => {
    agentRef.current = [...agentRef.current.slice(1), value];
    setAgentLevel([...agentRef.current]);
  }, []);

  const clear = useCallback(() => {
    userRef.current = Array(BUFFER_SIZE).fill(0);
    agentRef.current = Array(BUFFER_SIZE).fill(0);
    setUserLevel(Array(BUFFER_SIZE).fill(0));
    setAgentLevel(Array(BUFFER_SIZE).fill(0));
  }, []);

  return {
    userLevel,
    agentLevel,
    pushUser,
    pushAgent,
    clear,
    userRef,
    agentRef,
  };
}