import { useEffect, useRef } from "react";

export default function Waveform({ stream, barWidth = 3, barGap = 2, height = 32 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stream) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    audioContext.createMediaStreamSource(stream).connect(analyser);

    const ctx = canvas.getContext("2d");
    const data = new Uint8Array(analyser.frequencyBinCount);
    const history = [];
    let frame = 0;
    let last = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = (time) => {
      frame = requestAnimationFrame(draw);
      if (time - last < 30) return;
      last = time;
      analyser.getByteFrequencyData(data);
      const band = data.slice(Math.floor(data.length * 0.05), Math.floor(data.length * 0.4));
      const level = band.reduce((sum, v) => sum + v, 0) / band.length / 255;
      history.push(Math.min(1, Math.max(0.06, level * 1.6)));

      const { width, height: h } = canvas.getBoundingClientRect();
      const step = barWidth + barGap;
      const count = Math.floor(width / step);
      if (history.length > count) history.splice(0, history.length - count);

      ctx.clearRect(0, 0, width, h);
      ctx.fillStyle = getComputedStyle(canvas).color;
      for (let i = 0; i < history.length; i++) {
        const value = history[history.length - 1 - i];
        const barHeight = Math.max(3, value * h * 0.9);
        ctx.globalAlpha = 0.45 + value * 0.55;
        ctx.beginPath();
        ctx.roundRect(width - (i + 1) * step, (h - barHeight) / 2, barWidth, barHeight, 1.5);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (audioContext.state !== "closed") audioContext.close();
    };
  }, [stream, barWidth, barGap]);

  return <canvas ref={canvasRef} className="waveform" style={{ height }} role="img" aria-label="Nivel del micrófono" />;
}
