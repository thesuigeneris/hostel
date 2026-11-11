'use client';

import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { buttonClass } from './ui';

/**
 * The submit button of a GET search form. The search itself is a plain page load (so it works without JavaScript
 * and the page is complete when it arrives); this only says "Searching…" while the next page loads, and resets if
 * the person comes back with the browser's back button.
 */
export function SearchButton({ className, children = 'Search', ...rest }: ComponentProps<'button'>) {
  const button = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const form = button.current?.form;
    if (!form) return;
    const onSubmit = (e: SubmitEvent) => {
      if (!e.defaultPrevented) setBusy(true);
    };
    const onShow = () => setBusy(false);
    form.addEventListener('submit', onSubmit);
    window.addEventListener('pageshow', onShow);
    return () => {
      form.removeEventListener('submit', onSubmit);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);
  return (
    <button ref={button} type="submit" aria-busy={busy || undefined} className={buttonClass('primary', 'md', className)} {...rest}>
      {busy ? 'Searching…' : children}
    </button>
  );
}
