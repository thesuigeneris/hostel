'use client';

import { SEARCH_TEXT_MAX, SUGGEST_MIN_CHARS, type Suggestion, type Suggestions, suggestionDetail, suggestionHref } from '@hostels/shared';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { keepParams, moveActive, suggestionStatus } from '@/lib/combobox';
import { cx, Input } from './ui';

const DEBOUNCE_MS = 200;

/**
 * The search text box, with areas and hostel names suggested while typing (WAI-ARIA combobox with a listbox popup).
 * The server renders a plain search input inside the GET form, so searching works without JavaScript; the combobox
 * roles are added once the script runs. Arrow keys move through the list, Enter opens the highlighted area or hostel
 * (or submits the search when nothing is highlighted), Escape closes the list, and Tab leaves it.
 */
export function SearchSuggest({
  label,
  hideLabel,
  defaultValue = '',
  placeholder = 'Area or hostel name',
}: {
  label: string;
  hideLabel?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-option-${i}`;
  const input = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  // Suggestions follow typing only: text that came in the URL is not looked up until the person edits it.
  const typed = useRef(false);
  const latest = useRef('');
  const [enhanced, setEnhanced] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('');

  useEffect(() => setEnhanced(true), []);

  // Debounced fetch. A newer keystroke aborts the older request, and a late answer for old text is ignored.
  useEffect(() => {
    if (!enhanced || !typed.current) return;
    const q = value.trim();
    latest.current = q;
    if (q.length < SUGGEST_MIN_CHARS) {
      setItems([]);
      setOpen(false);
      setActive(-1);
      setStatus('');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
        const data = (await res.json()) as Suggestions;
        if (latest.current !== q) return;
        setItems(data.items);
        setActive(-1);
        setOpen(focused.current && data.items.length > 0);
        if (focused.current) setStatus(suggestionStatus(data.items.length));
      } catch {
        // Aborted, offline or the API is down: the plain search still works.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, enhanced]);

  // Keep the highlighted option in view when the list scrolls.
  useEffect(() => {
    if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  });

  function choose(s: Suggestion) {
    const form = input.current?.form;
    setOpen(false);
    setValue(s.label);
    // A full page load, like every other search link: the area keeps the filters already set in this form.
    window.location.assign(suggestionHref(s, form ? keepParams(new FormData(form)) : ''));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      if (!open) {
        setOpen(true);
        if (!e.altKey) setActive(e.key === 'ArrowDown' ? 0 : items.length - 1);
        return;
      }
      setActive(moveActive(active, items.length, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      const pick = open && active >= 0 ? items[active] : undefined;
      if (pick && !e.nativeEvent.isComposing) {
        e.preventDefault();
        choose(pick);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  const combobox = enhanced
    ? {
        role: 'combobox',
        'aria-autocomplete': 'list' as const,
        'aria-expanded': open,
        'aria-controls': listId,
        'aria-activedescendant': open && active >= 0 ? optionId(active) : undefined,
      }
    : {};

  return (
    <div className="relative">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 block text-sm font-medium text-ink'}>
        {label}
      </label>
      <Input
        ref={input}
        id={id}
        name="q"
        type="search"
        value={value}
        placeholder={placeholder}
        maxLength={SEARCH_TEXT_MAX}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          typed.current = true;
          setValue(e.target.value);
          setActive(-1);
        }}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        {...combobox}
      />
      {enhanced && (
        // The APG combobox pattern: focus stays in the input and the highlighted option is named by
        // aria-activedescendant, so a native <select> can't stand in for this list.
        <div
          id={listId}
          // biome-ignore lint/a11y/useSemanticElements: a listbox popup for a text input (see above)
          role="listbox"
          tabIndex={-1}
          aria-label="Suggestions"
          hidden={!open}
          // Keep focus in the input, so the list doesn't close before a click lands.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-drawer mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface p-1 text-left shadow-overlay"
        >
          {items.map((s, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard moves through options from the input
            <div
              key={`${s.kind}-${s.slug}`}
              id={optionId(i)}
              // biome-ignore lint/a11y/useSemanticElements: an option of the listbox above
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => choose(s)}
              className={cx('flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-3 py-1.5', i === active ? 'bg-brand-soft' : 'hover:bg-bg')}
            >
              <span className="font-medium text-ink">{s.label}</span>
              <span className="text-xs text-ink-soft">{suggestionDetail(s)}</span>
            </div>
          ))}
        </div>
      )}
      <output className="sr-only" aria-live="polite">
        {status}
      </output>
    </div>
  );
}
