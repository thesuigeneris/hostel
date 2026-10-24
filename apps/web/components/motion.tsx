'use client';

/**
 * Motion policy (PRP-12).
 * - Section reveals: CSS transitions triggered by IntersectionObserver. No animation library ships on
 *   routes that only need a fade, and dashboards pay nothing.
 * - Interactive motion (drawers, dialogs) uses the free `motion` package inside those components only,
 *   wrapped in <MotionProvider> so `reducedMotion="user"` applies.
 * - Everything honours prefers-reduced-motion. Content above the fold is never hidden, and content
 *   is visible without JavaScript.
 */
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** True when the person asked the OS for less motion. Server render assumes motion is allowed. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Fades a section up the first time it scrolls into view. Already-visible sections are left alone. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const [state, setState] = useState<'static' | 'waiting' | 'shown'>('static');

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !('IntersectionObserver' in window)) return;
    // Only hide things that are still below the fold, so nothing visible ever blinks out.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    setState('waiting');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState('shown');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  return (
    <div ref={ref} data-reveal={state} className={className}>
      {children}
    </div>
  );
}
