'use client';

import { useEffect, useRef, useState } from 'react';
import { Photo } from './Photo';
import { buttonClass, cx, focusRing } from './ui';

type GalleryPhoto = { id: string; url: string };

/**
 * Listing photos. Phones get a swipeable strip (CSS scroll snap, no script needed to swipe); larger
 * screens get a grid. "All photos" opens a lightbox: a native modal dialog with arrow-key, button and
 * swipe navigation. Failed images fall back to a placeholder (Photo).
 */
export function PhotoGallery({ photos, name }: { photos: GalleryPhoto[]; name: string }) {
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const strip = useRef<HTMLUListElement>(null);
  const n = photos.length;
  const alt = (i: number) => `${name}, photo ${i + 1} of ${n}`;

  // Keep the "2 / 5" counter in step with swipes on the phone strip.
  useEffect(() => {
    const el = strip.current;
    if (!el || n < 2) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.index));
      },
      { root: el, threshold: 0.6 },
    );
    for (const li of el.children) io.observe(li);
    return () => io.disconnect();
  }, [n]);

  if (!n) {
    return (
      <div className="grid aspect-[16/7] place-items-center rounded-2xl border border-dashed border-line bg-brand-soft/50 text-sm text-ink-soft">
        No photos yet
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Phones: one photo per screen, swipe sideways. */}
      <ul ref={strip} className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl [scrollbar-width:none] sm:hidden" aria-label="Photos">
        {photos.map((p, i) => (
          <li key={p.id} data-index={i} className="w-full shrink-0 snap-center">
            <button type="button" className={cx('block w-full', focusRing)} onClick={() => setOpen(i)} aria-label={`Open ${alt(i)}`}>
              <Photo src={p.url} alt={alt(i)} eager={i === 0} className="aspect-[4/3] w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {n > 1 && (
        <span aria-hidden="true" className="absolute bottom-3 right-3 rounded-full bg-ink/75 px-2.5 py-0.5 text-xs font-medium text-white sm:hidden">
          {current + 1} / {n}
        </span>
      )}

      {/* Larger screens: a capped-height grid so the name, price and actions stay above the fold. */}
      <div className={cx('hidden gap-2 overflow-hidden rounded-2xl sm:grid sm:h-[380px]', n > 1 ? 'sm:grid-cols-3 sm:grid-rows-2' : '')}>
        {photos.slice(0, 3).map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`Open ${alt(i)}`}
            className={cx('min-h-0 overflow-hidden', focusRing, i === 0 && n > 1 ? 'sm:col-span-2 sm:row-span-2' : '', n === 2 && i === 1 ? 'sm:row-span-2' : '')}
          >
            <Photo src={p.url} alt={alt(i)} eager={i === 0} className="h-full w-full object-cover transition duration-section hover:scale-[1.02] motion-reduce:hover:scale-100" />
          </button>
        ))}
      </div>
      {n > 1 && (
        <button type="button" onClick={() => setOpen(0)} className={buttonClass('secondary', 'sm', 'absolute bottom-3 left-3 bg-surface/95 sm:left-auto sm:right-3')}>
          All {n} photos
        </button>
      )}

      {open !== null && <Lightbox photos={photos} start={open} alt={alt} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Lightbox({ photos, start, alt, onClose }: { photos: GalleryPhoto[]; start: number; alt: (i: number) => string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(start);
  const touch = useRef<number | null>(null);
  const n = photos.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const opener = document.activeElement as HTMLElement | null;
    d.showModal();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label="Photos"
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-ink p-0 text-white backdrop:bg-ink"
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1);
        if (e.key === 'ArrowLeft') go(-1);
      }}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <p aria-live="polite" className="text-sm">Photo {i + 1} of {n}</p>
          <button type="button" onClick={() => ref.current?.close()} className={buttonClass('ghost', 'md', 'text-white hover:bg-white/10 hover:text-white')}>
            Close
          </button>
        </div>
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6"
          onTouchStart={(e) => {
            touch.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const startX = touch.current;
            const endX = e.changedTouches[0]?.clientX;
            if (startX !== null && endX !== undefined && Math.abs(endX - startX) > 40) go(endX < startX ? 1 : -1);
            touch.current = null;
          }}
        >
          <Photo key={photos[i]!.id} src={photos[i]!.url} alt={alt(i)} eager className="max-h-full max-w-full rounded-xl object-contain" />
          {n > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} className={cx('absolute left-2 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-2xl hover:bg-white/25', focusRing)}>
                <span aria-hidden="true">‹</span>
                <span className="sr-only">Previous photo</span>
              </button>
              <button type="button" onClick={() => go(1)} className={cx('absolute right-2 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-2xl hover:bg-white/25', focusRing)}>
                <span aria-hidden="true">›</span>
                <span className="sr-only">Next photo</span>
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
