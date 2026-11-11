import { inArray } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { routePath } from 'hono/route';
import { getDb, schema } from '../db';
import { type RequestContext, runInRequestContext } from '../lib/request-context';
import { audit } from '../services/audit';
import type { AppEnv } from './auth';

/** What an owner-power change did, in the console's words. Anything not listed is named by its route. */
const DESCRIBE: Record<string, string> = {
  'PATCH /owner/hostels/:id': 'Edited the listing',
  'POST /owner/hostels/:id/submit': 'Sent the listing for review',
  'POST /owner/hostels/:id/partner': 'Applied for partner',
  'POST /owner/hostels/:id/rooms': 'Added a room type',
  'PATCH /owner/rooms/:roomId': 'Edited a room type',
  'DELETE /owner/rooms/:roomId': 'Deleted a room type',
  'POST /owner/hostels/:id/photos': 'Added a photo',
  'DELETE /owner/hostels/:id/photos/:photoId': 'Removed a photo',
  'PUT /owner/hostels/:id/photos/order': 'Reordered the photos',
  'PATCH /owner/visits/:id': 'Changed a visit request',
  'PUT /owner/hostels/:id/menus/:weekStart': 'Saved the menu',
  'POST /owner/hostels/:id/menus/:weekStart/copy-last': "Copied last week's menu",
  'POST /owner/hostels/:id/plan': 'Changed the plan',
  'POST /owner/hostels/:id/residents': 'Added a resident',
  'POST /owner/hostels/:id/residents/:rid/end': "Ended a resident's stay",
  'PUT /owner/hostels/:id/rent/:rid': 'Recorded rent',
  'POST /owner/reviews/:id/reply': 'Replied to a review',
  'POST /issues/:id/updates': 'Updated an issue',
  'PATCH /posts/:id': 'Hid, showed or pinned a post',
  'PATCH /comments/:id': 'Hid or showed a comment',
  'DELETE /posts/:id': 'Deleted a post',
  'DELETE /comments/:id': 'Deleted a comment',
  'POST /hostels/:id/community': 'Posted on the community board',
  'POST /posts/:id/comments': 'Commented on the community board',
};

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Admins may act in any owner's workspace (the admin bypass in `ownedHostel` and `requireMember`). Every such change
 * that succeeds is written to the audit log with the admin as the actor and the hostel as the target (edge case O7),
 * in one place, so a new owner route is covered without remembering to add a line. The admin console's own routes
 * write their own, more specific entries.
 */
export const auditAdminActing = createMiddleware<AppEnv>(async (c, next) => {
  const ctx: RequestContext = { actingFor: new Map() };
  await runInRequestContext(ctx, () => next());
  if (READS.has(c.req.method) || c.res.status >= 400 || !ctx.actingFor.size || c.req.path.startsWith('/admin/')) return;
  const admin = c.get('user');
  if (!admin) return;
  const route = `${c.req.method} ${routePath(c)}`;
  const what = DESCRIBE[route] ?? route;
  try {
    const targets = [...ctx.actingFor.values()];
    const owners = await getDb()
      .select({ id: schema.users.id, name: schema.users.name, phone: schema.users.phone })
      .from(schema.users)
      .where(inArray(schema.users.id, targets.map((t) => t.ownerId)));
    for (const t of targets) {
      const owner = owners.find((o) => o.id === t.ownerId);
      const whose = owner ? `owner ${owner.name || 'unnamed'} (+91 ${owner.phone})` : 'owner unknown';
      await audit(admin.id, 'owner.admin_action', { type: 'hostel', id: t.hostelId }, `${what} at ${t.hostelName} for ${whose} · ${c.req.method} ${c.req.path}`);
    }
  } catch (e) {
    // The change itself succeeded; a failed log line must not turn it into an error for the admin.
    console.error('[audit] could not record an admin action in an owner workspace', e);
  }
});
