'use server';

import { moderationReason, type PartnerStandardId } from '@hostels/shared';
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

/** Hide (a rule and note), show again, or keep (a note) a flagged review. Public pages update at once. */
export async function moderateReviewAction(form: FormData) {
  const id = str(form, 'id');
  const action = str(form, 'action');
  // Keeping needs no rule: the note, or a plain default, is the reason on the record.
  const reason = action === 'keep' ? str(form, 'note') || KEEP_REASON : moderationReason(str(form, 'rule'), str(form, 'note'));
  await run(
    back(form, '/admin/moderation'),
    async () => {
      const client = await api();
      if (action === 'unhide') return publicChange(client.admin.unhideReview(id));
      if (action === 'keep') return client.admin.keepReview(id, reason);
      return publicChange(client.admin.hideReview(id, reason));
    },
    { ok: action === 'unhide' ? 'Review is visible again' : action === 'keep' ? 'Review kept; its flags are dismissed' : 'Review hidden' },
  );
}
/** The same for a reported post or comment. */
export async function moderateContentAction(form: FormData) {
  const action = str(form, 'action') as 'hide' | 'unhide' | 'keep';
  const type = str(form, 'type') === 'comment' ? 'comment' : 'post';
  await run(
    back(form, '/admin/moderation'),
    async () =>
      (await api()).admin.moderateContent(
        type,
        str(form, 'id'),
        action,
        action === 'keep' ? str(form, 'note') || KEEP_REASON : moderationReason(str(form, 'rule'), str(form, 'note')),
      ),
    { ok: action === 'unhide' ? 'Visible again' : action === 'keep' ? 'Kept; its reports are dismissed' : 'Hidden from the board' },
  );
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
