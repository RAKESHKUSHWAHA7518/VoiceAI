// ============================================================================
// Web Audio API Streaming Audio Player Hook
// Buffers and plays incoming 16kHz/24kHz PCM chunks seamlessly with instant interruption flushing
// ============================================================================

import { useRef, useCallback, useEffect } from 'react';

export function useAudioPlayer(sampleRate: number = 24000) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Initialize or resume AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx({ sampleRate });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(console.error);
    }
    return audioContextRef.current;
  }, [sampleRate]);

  // Queue and play an incoming PCM16 chunk
  const playPcmChunk = useCallback((pcm16Data: Uint8Array | ArrayBuffer, chunkSampleRate?: number) => {
    const ctx = getAudioContext();
    const rate = chunkSampleRate || sampleRate;

    const buffer = pcm16Data instanceof ArrayBuffer ? pcm16Data : pcm16Data.buffer;
    const int16Array = new Int16Array(buffer);
    if (int16Array.length === 0) return;

    // Convert Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    // Create AudioBuffer
    const audioBuffer = ctx.createBuffer(1, float32Array.length, rate);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Schedule next play time to ensure seamless continuity
    const currentTime = ctx.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    source.start(startTime);

    nextPlayTimeRef.current = startTime + audioBuffer.duration;
    isPlayingRef.current = true;
    activeSourcesRef.current.push(source);

    source.onended = () => {
      const idx = activeSourcesRef.current.indexOf(source);
      if (idx !== -1) {
        activeSourcesRef.current.splice(idx, 1);
      }
      if (activeSourcesRef.current.length === 0) {
        isPlayingRef.current = false;
      }
    };
  }, [getAudioContext, sampleRate]);

  // Stop all playing audio immediately (User Barge-In / Interruption)
  const stopAndFlush = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    activeSourcesRef.current = [];
    if (audioContextRef.current) {
      nextPlayTimeRef.current = audioContextRef.current.currentTime;
    } else {
      nextPlayTimeRef.current = 0;
    }
    isPlayingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      stopAndFlush();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [stopAndFlush]);

  return {
    playPcmChunk,
    stopAndFlush,
    isPlaying: isPlayingRef.current,
    getAudioContext,
  };
}
