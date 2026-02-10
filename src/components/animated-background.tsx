import React, { useEffect, useRef } from 'react';

interface AnimatedBackgroundProps {
  /** Opacity of the entire canvas (0-1). Use lower values for subtle background. */
  opacity?: number;
  /** Whether to show the grid overlay */
  showGrid?: boolean;
  /** Number of floating particles */
  particleCount?: number;
  /** Animation speed multiplier */
  speed?: number;
}

/**
 * Animated canvas background with floating green orbs, particles, and optional grid.
 * Used on auth page (full opacity) and main app (subtle backdrop).
 */
const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  opacity = 0.4,
  showGrid = true,
  particleCount = 20,
  speed = 1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      time += 0.003 * speed;
      const w = canvas.width;
      const h = canvas.height;

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Floating orbs
      const orbs = [
        { x: 0.3 + Math.sin(time * 0.7) * 0.15, y: 0.4 + Math.cos(time * 0.5) * 0.2, r: 0.4, color: 'rgba(163, 255, 0, 0.06)' },
        { x: 0.7 + Math.cos(time * 0.6) * 0.1, y: 0.6 + Math.sin(time * 0.4) * 0.15, r: 0.35, color: 'rgba(184, 255, 77, 0.04)' },
        { x: 0.5 + Math.sin(time * 0.8) * 0.2, y: 0.3 + Math.cos(time * 0.3) * 0.1, r: 0.3, color: 'rgba(163, 255, 0, 0.05)' },
        { x: 0.2 + Math.cos(time * 0.5) * 0.1, y: 0.8 + Math.sin(time * 0.6) * 0.1, r: 0.25, color: 'rgba(107, 179, 0, 0.04)' },
      ];

      for (const orb of orbs) {
        const grad = ctx.createRadialGradient(
          orb.x * w, orb.y * h, 0,
          orb.x * w, orb.y * h, orb.r * Math.min(w, h)
        );
        grad.addColorStop(0, orb.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Subtle grid overlay
      if (showGrid) {
        ctx.strokeStyle = 'rgba(163, 255, 0, 0.015)';
        ctx.lineWidth = 1;
        const gridSize = 80;
        for (let x = 0; x < w; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }

      // Floating particles
      for (let i = 0; i < particleCount; i++) {
        const px = (Math.sin(time * 0.5 + i * 1.7) * 0.5 + 0.5) * w;
        const py = (Math.cos(time * 0.3 + i * 2.1) * 0.5 + 0.5) * h;
        const size = 1 + Math.sin(time + i) * 0.5;
        const alpha = 0.12 + Math.sin(time * 2 + i * 0.8) * 0.08;
        ctx.fillStyle = `rgba(163, 255, 0, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [opacity, showGrid, particleCount, speed]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity }}
    />
  );
};

export default AnimatedBackground;
