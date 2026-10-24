'use server';

import type { IssueCategory, IssueStatus, PostKind } from '@hostels/shared';
import { revalidatePath } from 'next/cache';
import { run, safePath, str } from '@/lib/actions';
import { api } from '@/lib/api';
import { uploadPhoto } from '@/lib/upload';

const back = (form: FormData, fallback = '/stay') => safePath(str(form, '_back'), fallback);
const rating = (form: FormData, key: string) => Number(str(form, key));

export async function respondInviteAction(form: FormData) {
  const accept = str(form, 'accept') === '1';
  await run('/stay', async () => {
    const client = await api();
    return accept ? client.me.acceptResidency(str(form, 'id')) : client.me.declineResidency(str(form, 'id'));
  }, { ok: accept ? 'Welcome! You can now see your hostel community.' : 'Invite declined' });
}

export async function moveOutAction(form: FormData) {
  await run('/stay', async () => (await api()).me.moveOut(str(form, 'id')), { ok: 'Marked as moved out. You can still review your stay.' });
}

export async function directoryAction(form: FormData) {
  await run(back(form), async () => (await api()).me.setDirectory(str(form, 'id'), str(form, 'on') === '1'));
}

export async function reviewAction(form: FormData) {
  const food = str(form, 'food');
  const slug = str(form, 'slug');
  await run(back(form), async () => {
    const review = await (await api()).hostels.review(str(form, 'hostelId'), {
      rating: rating(form, 'rating'),
      cleanliness: rating(form, 'cleanliness'),
      safety: rating(form, 'safety'),
      responsiveness: rating(form, 'responsiveness'),
      food: food ? Number(food) : null,
      body: str(form, 'body'),
    });
    // The public page caches reviews briefly; show the new one right away.
    if (slug) revalidatePath(`/hostels/${slug}`);
    return review;
  }, { ok: 'Thanks! Your review is live.' });
}

export async function reportIssueAction(form: FormData) {
  const hostelId = str(form, 'hostelId');
  await run(back(form), async () => {
    const client = await api();
    const photoUrl = await uploadPhoto(client, form);
    return client.resident.reportIssue(hostelId, {
      category: str(form, 'category') as IssueCategory,
      title: str(form, 'title'),
      description: str(form, 'description'),
      photoUrl,
    });
  }, { to: (issue) => `/issues/${issue.id}?ok=${encodeURIComponent('Issue reported. The hostel has been notified.')}` });
}

export async function updateIssueAction(form: FormData) {
  const id = str(form, 'issueId');
  await run(back(form, `/issues/${id}`), async () =>
    (await api()).resident.updateIssue(id, { status: (str(form, 'status') || undefined) as IssueStatus | undefined, message: str(form, 'message') || undefined }),
  );
}

export async function upvoteAction(form: FormData) {
  const id = str(form, 'issueId');
  await run(back(form, `/issues/${id}`), async () => (await api()).resident.upvote(id, str(form, 'on') === '1'));
}

export async function postAction(form: FormData) {
  await run(back(form), async () => {
    const client = await api();
    const photoUrl = await uploadPhoto(client, form);
    return client.resident.post(str(form, 'hostelId'), { kind: (str(form, 'kind') || 'general') as PostKind, body: str(form, 'body'), photoUrl });
  });
}

export async function commentAction(form: FormData) {
  await run(back(form), async () => (await api()).resident.comment(str(form, 'postId'), str(form, 'body')));
}

export async function deletePostAction(form: FormData) {
  await run(back(form), async () => {
    const client = await api();
    const commentId = str(form, 'commentId');
    return commentId ? client.resident.deleteComment(commentId) : client.resident.deletePost(str(form, 'postId'));
  });
}

export async function reportContentAction(form: FormData) {
  const type = str(form, 'type') === 'comment' ? 'comment' : 'post';
  await run(back(form), async () => (await api()).resident.report(type, str(form, 'id'), str(form, 'reason') || 'Inappropriate'), {
    ok: 'Reported. The hostel and our team will review it.',
  });
}

export async function moderateAction(form: FormData) {
  await run(back(form), async () => {
    const client = await api();
    const commentId = str(form, 'commentId');
    if (commentId) return client.resident.moderateComment(commentId, str(form, 'hidden') === '1');
    const patch: { hidden?: boolean; pinned?: boolean } = {};
    if (form.has('hidden')) patch.hidden = str(form, 'hidden') === '1';
    if (form.has('pinned')) patch.pinned = str(form, 'pinned') === '1';
    return client.resident.moderatePost(str(form, 'postId'), patch);
  });
}

export async function likeAction(form: FormData) {
  await run(back(form), async () => (await api()).resident.like(str(form, 'postId'), str(form, 'on') === '1'));
}
