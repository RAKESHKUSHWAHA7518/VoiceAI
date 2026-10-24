// ============================================================================
// WebSocket Hook
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { parseControlFrame } from '../utils/frame';
import type { TranscriptMsg, BargeInEvent, ToolCall, MetricsData, DashboardState, PlaygroundConfig, PlaygroundTest } from '../types';

interface UseWebSocketOptions {
  url: string;
  onTranscript?: (transcript: TranscriptMsg) => void;
  onBargeIn?: (event: BargeInEvent) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onMetrics?: (metrics: MetricsData) => void;
  onSessionStart?: (sessionId: string) => void;
  onPlaygroundConfig?: (config: PlaygroundConfig) => void;
  onPlaygroundTestStart?: (test: PlaygroundTest) => void;
  onPlaygroundTestComplete?: (test: PlaygroundTest) => void;
  onPlaygroundTestResults?: (tests: PlaygroundTest[]) => void;
  onDashboardState?: (state: DashboardState) => void;
  onAudioFrame?: (pcmChunk: Uint8Array) => void;
  onFlushBuffer?: () => void;
  onError?: (error: string) => void;
}

interface UseWebSocketReturn {
  ws: WebSocket | null;
  connected: boolean;
  sequence: number;
  sendControl: (type: string, payload: Record<string, unknown>) => void;
  sendAudioChunk: (pcm16: Uint8Array) => void;
  sendInterrupt: () => void;
  sendPing: () => void;
}

export function useWebSocket({
  url,
  onTranscript,
  onBargeIn,
  onToolCall,
  onMetrics,
  onSessionStart,
  onPlaygroundConfig,
  onPlaygroundTestStart,
  onPlaygroundTestComplete,
  onPlaygroundTestResults,
  onDashboardState,
  onAudioFrame,
  onFlushBuffer,
  onError,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sequence, setSequence] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Store latest callbacks in ref to prevent effect recreation on every render
  const callbacksRef = useRef({
    onTranscript,
    onBargeIn,
    onToolCall,
    onMetrics,
    onSessionStart,
    onPlaygroundConfig,
    onPlaygroundTestStart,
    onPlaygroundTestComplete,
    onPlaygroundTestResults,
    onDashboardState,
    onAudioFrame,
    onFlushBuffer,
    onError,
  });

  useEffect(() => {
    callbacksRef.current = {
      onTranscript,
      onBargeIn,
      onToolCall,
      onMetrics,
      onSessionStart,
      onPlaygroundConfig,
      onPlaygroundTestStart,
      onPlaygroundTestComplete,
      onPlaygroundTestResults,
      onDashboardState,
      onAudioFrame,
      onFlushBuffer,
      onError,
    };
  });

  const handleMessage = useCallback((data: ArrayBuffer) => {
    const control = parseControlFrame(data);
    if (!control) return;

    const { type, payload } = control;
    const cb = callbacksRef.current;

    switch (type) {
      case 'session_start': {
        const id = (payload.session_id || payload.sessionId || '') as string;
        cb.onSessionStart?.(id);
        break;
      }
      case 'transcript':
        cb.onTranscript?.({
          role: (payload.role as TranscriptMsg['role']) || 'user',
          text: (payload.text || '') as string,
          is_final: Boolean(payload.is_final),
          timestamp: Date.now(),
        });
        break;
      case 'barge_in':
        cb.onBargeIn?.({ timestamp: Date.now() });
        break;
      case 'flush_buffer':
        cb.onFlushBuffer?.();
        break;
      case 'tool_call':
        cb.onToolCall?.({
          tool_name: (payload.tool_name || payload.name || '') as string,
          args: (payload.args || {}) as Record<string, unknown>,
          status: (payload.status as ToolCall['status']) || 'pending',
          timestamp: Date.now(),
        });
        break;
      case 'metrics':
        cb.onMetrics?.(payload as MetricsData);
        break;
      case 'playground_config':
        cb.onPlaygroundConfig?.(payload.config as PlaygroundConfig);
        break;
      case 'playground_test_start':
        cb.onPlaygroundTestStart?.(payload.test as PlaygroundTest);
        break;
      case 'playground_test_complete':
        cb.onPlaygroundTestComplete?.(payload.test as PlaygroundTest);
        break;
      case 'playground_test_results':
        cb.onPlaygroundTestResults?.(payload.tests as PlaygroundTest[]);
        break;
      case 'state':
        cb.onDashboardState?.(payload as unknown as DashboardState);
        break;
      case 'error':
        cb.onError?.((payload.message || 'Unknown error') as string);
        break;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    if (!url) return;

    function connect() {
      if (!isMountedRef.current) return;

      try {
        const websocket = new WebSocket(url);
        websocket.binaryType = 'arraybuffer';
        wsRef.current = websocket;
        setWs(websocket);

        websocket.onopen = () => {
          if (!isMountedRef.current) return;
          setConnected(true);
          console.log('[VoiceAI] WebSocket connected to', url);
        };

        websocket.onclose = () => {
          if (!isMountedRef.current) return;
          setConnected(false);
          console.log('[VoiceAI] WebSocket disconnected from', url);

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        websocket.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            // Check for binary audio frame (0x01)
            if (event.data.byteLength >= 9) {
              const frameType = new DataView(event.data).getUint8(0);
              if (frameType === 0x01) {
                const payloadLen = new DataView(event.data).getUint32(5, false);
                const pcmBytes = new Uint8Array(event.data.slice(9, 9 + payloadLen));
                callbacksRef.current.onAudioFrame?.(pcmBytes);
                return;
              }
            }
            handleMessage(event.data);
          }
        };

        websocket.onerror = (error) => {
          console.error('[VoiceAI] WebSocket error:', error);
          callbacksRef.current.onError?.('WebSocket connection error');
        };
      } catch (err) {
        console.error('[VoiceAI] Failed to connect WebSocket:', err);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      }
    }

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url, handleMessage]);

  const sendControl = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;

    const control = { type, payload };
    const payloadBytes = new TextEncoder().encode(JSON.stringify(control));
    const frame = new Uint8Array(9 + payloadBytes.length);
    frame[0] = 0x02; // CONTROL
    new DataView(frame.buffer).setUint32(1, sequence, false);
    new DataView(frame.buffer).setUint32(5, payloadBytes.length, false);
    frame.set(payloadBytes, 9);
    currentWs.send(frame);
    setSequence(s => s + 1);
  }, [sequence]);

  const sendAudioChunk = useCallback((pcm16: Uint8Array) => {
    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;

    const frame = new Uint8Array(9 + pcm16.length);
    frame[0] = 0x01; // AUDIO
    new DataView(frame.buffer).setUint32(1, sequence, false);
    new DataView(frame.buffer).setUint32(5, pcm16.length, false);
    frame.set(pcm16, 9);
    currentWs.send(frame);
    setSequence(s => s + 1);
  }, [sequence]);

  const sendInterrupt = useCallback(() => {
    sendControl('interrupt', {});
  }, [sendControl]);

  const sendPing = useCallback(() => {
    sendControl('ping', {});
  }, [sendControl]);

  return { ws, connected, sequence, sendControl, sendAudioChunk, sendInterrupt, sendPing };
}
