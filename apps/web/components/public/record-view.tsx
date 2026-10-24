'use client';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/client-api';

/** Counts one page view per mount (owner insights). Failures are ignored. */
export function RecordView({ slug }: { slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api.hostels.recordView(slug).catch(() => {});
  }, [slug]);
  return null;
}
