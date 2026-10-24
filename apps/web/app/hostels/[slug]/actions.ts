'use server';

import { run, str } from '@/lib/actions';
import { api } from '@/lib/api';

export async function requestVisitAction(form: FormData) {
  const slug = str(form, 'slug');
  await run(`/hostels/${slug}`, async () => (await api()).hostels.requestVisit(str(form, 'hostelId'), {
    preferredDate: str(form, 'preferredDate'),
    message: str(form, 'message'),
  }), { ok: 'Visit requested. The hostel will call you to confirm.' });
}

export async function flagReviewAction(form: FormData) {
  await run(`/hostels/${str(form, 'slug')}`, async () => (await api()).hostels.flagReview(str(form, 'reviewId'), str(form, 'reason') || 'Looks wrong'), {
    ok: 'Thanks, our team will take a look.',
  });
}
