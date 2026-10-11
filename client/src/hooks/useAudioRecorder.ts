// ============================================================================
// Web Audio API Microphone Recorder & Streamer Hook
// Captures live mic input, converts to 16kHz PCM Int16, and calculates real-time RMS volume
// ============================================================================

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioRecorderOptions {
  onAudioChunk?: (pcm16Bytes: Uint8Array) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

export function useAudioRecorder({
  onAudioChunk,
  onSpeechStart,
  onSpeechEnd,
}: UseAudioRecorderOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0); // 0 to 100
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Downsample to 16kHz linear PCM
  const downsampleTo16k = (buffer: Float32Array, inputSampleRate: number): Int16Array => {
    if (inputSampleRate === 16000) {
      const result = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return result;
    }

    const ratio = inputSampleRate / 16000;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const idx = Math.round(i * ratio);
      const s = Math.max(-1, Math.min(1, buffer[idx] || 0));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return result;
  };

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // 4096 buffer size gives ~90ms chunks at 44.1/48kHz
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = downsampleTo16k(inputData, audioCtx.sampleRate);
        const uint8Bytes = new Uint8Array(pcm16.buffer);
        onAudioChunk?.(uint8Bytes);
      };

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      setIsRecording(true);
      onSpeechStart?.();

      // Monitor volume levels
      const updateVolume = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalizedVol = Math.min(100, Math.round((avg / 128) * 100));
        setVolume(normalizedVol);

        animFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err: any) {
      console.error('[useAudioRecorder] Mic access error:', err);
      setError(err?.message || 'Could not access microphone');
      setIsRecording(false);
    }
  }, [onAudioChunk, onSpeechStart]);

  const stopRecording = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setVolume(0);
    onSpeechEnd?.();
  }, [onSpeechEnd]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    volume,
    error,
    startRecording,
    stopRecording,
  };
}
