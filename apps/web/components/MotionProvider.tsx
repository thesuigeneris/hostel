'use client';

/**
 * Wrap interactive components that use the `motion` package (drawers, dialogs) in this provider, not the
 * whole app, so only routes with those components download it. `reducedMotion="user"` drops transforms
 * for people who prefer reduced motion; LazyMotion + `m` keeps the runtime to the small DOM feature set.
 */
import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { motion as tokens } from '@/lib/tokens';

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: tokens.panel / 1000, ease: tokens.easeOut }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
