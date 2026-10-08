// ============================================================================
// Waveform Component
// ============================================================================

import { useRef, useEffect } from 'react';

interface WaveformProps {
  buffer: number[];
  color: string;
  label: string;
}

export function Waveform({ buffer, color, label }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = canvas.clientHeight * window.devicePixelRatio;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      const step = width / Math.max(buffer.length, 1);
      buffer.forEach((val, i) => {
        const x = i * step;
        const y = height / 2 + val * height / 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    const animate = () => {
      draw();
      requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [buffer, color]);

  return (
    <div className="waveform-container">
      <canvas ref={canvasRef} className="waveform-canvas" />
      <div className="waveform-label">{label}</div>
    </div>
  );
}