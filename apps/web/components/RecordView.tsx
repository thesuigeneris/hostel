'use client';

import { useEffect } from 'react';
import { recordViewAction } from '@/app/hostels/[slug]/actions';

/** Records one view per page load, from the browser so crawlers and prefetches don't count. */
export function RecordView({ slug }: { slug: string }) {
  useEffect(() => {
    void recordViewAction(slug);
  }, [slug]);
  return null;
}
