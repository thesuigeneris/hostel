'use server';

import { ApiError, moderationReason, type PartnerStandardId } from '@hostels/shared';
import { revalidatePath } from 'next/cache';
import { num, run, safePath, str } from '@/lib/actions';
import { api } from '@/lib/api';

const back = (form: FormData, fallback = '/admin') => safePath(str(form, '_back'), fallback);
/**
 * Listing, partner and review decisions show on public hostel pages at once. `run()` already drops the cached
 * public API data; this also drops the rendered hostel pages, as the owner review reply does.
 */
async function publicChange<T>(change: Promise<T>): Promise<T> {
  const result = await change;
  revalidatePath('/hostels/[slug]', 'page');
  revalidatePath('/hostels');
  return result;
}
const checklist = (form: FormData) => form.getAll('checklist').map(String) as PartnerStandardId[];

export async function approveAction(form: FormData) {
  await run(back(form), async () => publicChange((await api()).admin.approve(str(form, 'hostelId'))), { ok: 'Listing is live' });
}
export async function rejectAction(form: FormData) {
  await run(back(form), async () => publicChange((await api()).admin.reject(str(form, 'hostelId'), str(form, 'reason'))), { ok: 'Listing sent back to the owner' });
}
export async function verifyPartnerAction(form: FormData) {
  await run(
    back(form),
    async () => publicChange((await api()).admin.verifyPartner(str(form, 'hostelId'), num(form, 'platformFeePct'), { checklist: checklist(form), note: str(form, 'note') })),
    { ok: 'Partner verified' },
  );
}
export async function saveChecklistAction(form: FormData) {
  await run(back(form), async () => (await api()).admin.saveChecklist(str(form, 'hostelId'), checklist(form), str(form, 'note')), { ok: 'Inspection progress saved' });
}
export async function voidOwnerBillAction(form: FormData) {
  await run(back(form, '/admin/billing'), async () => (await api()).admin.voidOwnerInvoice(str(form, 'id'), str(form, 'reason')), { ok: 'Bill waived' });
}
export async function markRefundedAction(form: FormData) {
  await run(back(form, '/admin/billing'), async () => (await api()).admin.markRefunded(str(form, 'id'), str(form, 'note')), { ok: 'Marked as refunded' });
}
export async function rejectPartnerAction(form: FormData) {
  await run(back(form), async () => publicChange((await api()).admin.rejectPartner(str(form, 'hostelId'), str(form, 'reason'))), { ok: 'Application declined' });
}
export async function setFeeAction(form: FormData) {
  await run(back(form), async () => (await api()).admin.setFee(str(form, 'hostelId'), num(form, 'platformFeePct')), { ok: 'Fee updated' });
}
export async function addFoodPartnerAction(form: FormData) {
  await run('/admin/food', async () => (await api()).admin.addFoodPartner({ name: str(form, 'name'), cuisine: str(form, 'cuisine'), logoUrl: str(form, 'logoUrl') || null }), { ok: 'Food partner added' });
}
export async function toggleFoodPartnerAction(form: FormData) {
  await run('/admin/food', async () => (await api()).admin.updateFoodPartner(str(form, 'id'), { active: str(form, 'active') === '1' }));
}
export async function generatePayoutsAction(form: FormData) {
  const month = str(form, 'month');
  await run(`/admin/payouts?month=${month}`, async () => (await api()).admin.generatePayouts(month), { ok: 'Payouts generated' });
}
export async function markPayoutPaidAction(form: FormData) {
  await run(back(form, '/admin/payouts'), async () => (await api()).admin.markPayoutPaid(str(form, 'id')), { ok: 'Marked as paid' });
}
const KEEP_REASON = 'Does not break the rules';

/**
 * What the admin decided. The choice travels in a hidden `decision` field (the form's own choice) or in which action
 * the pressed button sends the form to (`formAction`, for "Keep it"), never in the pressed button's name and value:
 * that value was lost on this page, so "Keep it" and "Show again" arrived empty and fell through to hiding.
 * Anything unknown is refused rather than guessed.
 */
type Decision = 'hide' | 'unhide' | 'keep';
function decisionOf(form: FormData): Decision | null {
  const d = str(form, 'decision');
  return d === 'hide' || d === 'unhide' || d === 'keep' ? d : null;
}
const noDecision = () => new ApiError(400, 'validation', 'Choose whether to hide, keep or show it again.');
/** Keeping needs no rule: the note, or a plain default, is the reason on the record. */
const reasonFor = (decision: Decision, form: FormData) =>
  decision === 'keep' ? str(form, 'note') || KEEP_REASON : moderationReason(str(form, 'rule'), str(form, 'note'));

const REVIEW_DONE: Record<Decision, string> = { unhide: 'Review is visible again', keep: 'Review kept; its flags are dismissed', hide: 'Review hidden' };
const CONTENT_DONE: Record<Decision, string> = { unhide: 'Visible again', keep: 'Kept; its reports are dismissed', hide: 'Hidden from the board' };

async function moderateReview(form: FormData, decision: Decision | null) {
  const id = str(form, 'id');
  await run(
    back(form, '/admin/moderation'),
    async () => {
      if (!decision) throw noDecision();
      const client = await api();
      if (decision === 'unhide') return publicChange(client.admin.unhideReview(id));
      if (decision === 'keep') return client.admin.keepReview(id, reasonFor(decision, form));
      return publicChange(client.admin.hideReview(id, reasonFor(decision, form)));
    },
    { ok: decision ? REVIEW_DONE[decision] : undefined },
  );
}

async function moderateContent(form: FormData, decision: Decision | null) {
  const type = str(form, 'type') === 'comment' ? 'comment' : 'post';
  await run(
    back(form, '/admin/moderation'),
    async () => {
      if (!decision) throw noDecision();
      return (await api()).admin.moderateContent(type, str(form, 'id'), decision, reasonFor(decision, form));
    },
    { ok: decision ? CONTENT_DONE[decision] : undefined },
  );
}

/** Hide (a rule and note) or show again a flagged review, as the form's hidden `decision` says. Public pages update at once. */
export async function moderateReviewAction(form: FormData) {
  await moderateReview(form, decisionOf(form));
}
/** "Keep it" on a flagged review: the button sends the form here, whatever the form's own decision is. */
export async function keepReviewAction(form: FormData) {
  await moderateReview(form, 'keep');
}
/** The same for a reported post or comment. */
export async function moderateContentAction(form: FormData) {
  await moderateContent(form, decisionOf(form));
}
export async function keepContentAction(form: FormData) {
  await moderateContent(form, 'keep');
}
export async function recheckPartnerAction(form: FormData) {
  await run(back(form, '/admin/partners'), async () => publicChange((await api()).admin.recheckPartner(str(form, 'hostelId'), checklist(form), str(form, 'note'))), {
    ok: 'New check recorded',
  });
}
export async function updateFoodPartnerAction(form: FormData) {
  await run('/admin/food', async () => (await api()).admin.updateFoodPartner(str(form, 'id'), { name: str(form, 'name'), cuisine: str(form, 'cuisine'), logoUrl: str(form, 'logoUrl') || null }), {
    ok: 'Food partner saved',
  });
}
export async function runJobsAction() {
  let summary = '';
  await run('/admin', async () => {
    const res = await (await api()).admin.runJobs();
    summary = Object.entries(res).map(([k, v]) => `${k}: ${v}`).join(', ');
  }, { to: () => `/admin?ok=${encodeURIComponent(`Jobs ran. ${summary}`)}` });
}
