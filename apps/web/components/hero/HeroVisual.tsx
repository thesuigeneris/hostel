'use client';

/**
 * Homepage hero illustration. Renders the static SVG first (same size, so nothing shifts), then upgrades
 * to the 3D scene only if WebGL works. three.js lives in its own chunk loaded here, so no other route
 * pays for it. Any failure keeps or restores the SVG. With reduced motion, the scene draws one still frame.
 */
import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../motion';
import { HeroIllustration } from './HeroIllustration';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

type Mode = 'static' | 'loading' | '3d';

export function HeroVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = usePrefersReducedMotion();
  const [mode, setMode] = useState<Mode>('static');

  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData || !webglAvailable() || !canvasRef.current) return;
    let handle: { dispose: () => void } | null = null;
    let cancelled = false;
    setMode('loading');
    import('./hostel-scene')
      .then(({ mountHostelScene }) => {
        if (cancelled || !canvasRef.current) return;
        handle = mountHostelScene(canvasRef.current, { still: !!reduce, onFail: () => setMode('static') });
        setMode('3d');
      })
      .catch(() => setMode('static'));
    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, [reduce]);

  return (
    <figure className="relative mx-auto w-full max-w-[560px]" data-hero-mode={mode}>
      <div className="relative aspect-[6/5] w-full">
        <HeroIllustration className={`absolute inset-0 h-full w-full transition-opacity duration-section ${mode === '3d' ? 'opacity-0' : 'opacity-100'}`} />
        <canvas
          ref={canvasRef}
          aria-hidden
          tabIndex={-1}
          className={`absolute inset-0 h-full w-full transition-opacity duration-section ${mode === '3d' ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
      <figcaption className="mt-2 text-center text-xs text-ink-muted">Illustration, not a real property.</figcaption>
    </figure>
  );
}
