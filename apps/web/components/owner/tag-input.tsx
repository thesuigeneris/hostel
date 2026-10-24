'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/field';

/** List of short strings edited as removable chips; Enter or comma adds one. */
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  maxLength = 40,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  maxLength?: number;
}) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const t = raw.trim().slice(0, maxLength);
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };
  const unused = suggestions.filter((s) => !value.includes(s));
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs text-brand">
              {t}
              <button type="button" aria-label={`Remove ${t}`} className="opacity-60 hover:opacity-100" onClick={() => onChange(value.filter((x) => x !== t))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
      {unused.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unused.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-muted hover:border-brand hover:text-brand">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
