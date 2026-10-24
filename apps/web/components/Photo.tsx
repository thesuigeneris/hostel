'use client';

import { useState } from 'react';
import { cx } from './ui';

/**
 * A listing photo that degrades to a neutral placeholder when the image is missing or fails to load
 * (dead link, blocked host, wrong upload URL), so a card never shows a broken-image icon.
 */
export function Photo({ src, alt, className, eager }: { src: string | null; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div role={alt ? 'img' : undefined} aria-label={alt || undefined} className={cx('grid place-items-center bg-brand-soft', className)}>
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-12 w-12 fill-brand/40">
          <path d="M6 40V18l18-12 18 12v22H30V28H18v12z" />
        </svg>
      </div>
    );
  }
  return (
    // Plain <img>: photos come from owners' uploads on any host, and next/image would need every host allow-listed.
    <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} className={className} />
  );
}
