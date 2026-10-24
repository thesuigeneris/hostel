import type { Loaded } from '@/components/public/safe';
import { LoadError } from '@/components/public/load-error';
import { getResidencyAt } from './context';
import { JoinPrompt } from './join-prompt';

/** Shared failure rendering for community pages: not_resident/forbidden → join prompt, else error. */
export async function CommunityError({ result, hostelId, retryHref }: { result: Extract<Loaded<unknown>, { ok: false }>; hostelId: string; retryHref: string }) {
  if (result.code === 'not_resident' || result.code === 'forbidden' || result.status === 403) {
    const res = await getResidencyAt(hostelId);
    return <JoinPrompt hostelSlug={res?.hostel.slug} pending={res?.status === 'pending'} />;
  }
  return <LoadError message={result.message} retryHref={retryHref} />;
}
