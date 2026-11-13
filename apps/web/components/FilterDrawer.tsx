'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { buttonClass, focusRing } from './ui';

/**
 * The secondary search filters. On large screens they sit inline in the form. On phones they open as a
 * bottom sheet: a native modal <dialog>, so focus stays inside, Escape closes it and the page behind is
 * inert. The dialog stays inside the <form>, so "Show results" submits every field together.
 * Without JavaScript the fields simply show inline (see the <noscript> rule).
 */
export function FilterDrawer({ count, clearHref, children }: { count: number; clearHref: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!open || !d) return;
    if (!d.open) d.showModal();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    // Rotating a tablet to landscape shows the inline filters, so the sheet is no longer needed.
    const wide = window.matchMedia('(min-width: 1024px)');
    const onWide = () => wide.matches && d.close();
    wide.addEventListener('change', onWide);
    return () => {
      root.style.overflow = overflow;
      wide.removeEventListener('change', onWide);
    };
  }, [open]);

  const label = count ? `Filters (${count})` : 'Filters';
  return (
    <>
      <noscript>
        <style>{'.js-filters-more{display:block!important}.js-filters-toggle{display:none!important}'}</style>
      </noscript>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        className={buttonClass('secondary', 'md', 'js-filters-toggle lg:hidden')}
        onClick={() => setOpen(true)}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current"><path d="M3 5h14v2H3zm3 4h8v2H6zm2 4h4v2H8z" /></svg>
        {label}
      </button>

      {/* The fields render in one place at a time: inline, or in the sheet while it is open. */}
      {!open && <div className="js-filters-more hidden lg:block">{children}</div>}
      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: a backdrop click is a pointer shortcut; Escape and the Close button cover the keyboard
        <dialog
          ref={dialog}
          aria-labelledby="filters-title"
          className="sheet m-0 mt-auto max-h-[88dvh] w-full max-w-none rounded-t-2xl bg-surface p-0 text-ink shadow-overlay backdrop:bg-ink/40"
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
          onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        >
          <div className="flex max-h-[88dvh] flex-col">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 id="filters-title" className="text-lg font-semibold">Filters</h2>
              <button
                type="button"
                className={`grid h-11 w-11 place-items-center rounded-xl text-ink-soft hover:bg-bg ${focusRing}`}
                onClick={() => dialog.current?.close()}
              >
                <span className="sr-only">Close filters</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current"><path d="M5.3 4 10 8.7 14.7 4 16 5.3 11.3 10l4.7 4.7-1.3 1.3-4.7-4.7L5.3 16 4 14.7 8.7 10 4 5.3z" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4">{children}</div>
            <div className="flex items-center gap-3 border-t border-line px-4 py-3">
              <a href={clearHref} className={buttonClass('ghost', 'md')}>Clear all</a>
              <button type="submit" className={buttonClass('primary', 'md', 'flex-1')}>Show results</button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
