import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';
import { holdRow } from './latch';

let hostel: { id: string };
let resident: { token: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  const ownerToken = await newOwner();
  const adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true });
  hostel = h.hostel;
  resident = await newTenant('Neha');
  await activeSubscriber(resident.token, hostel.id, h.rooms[0].id);
});

afterEach(() => setClock(null));

const comments = (postId: string) => getDb().select().from(schema.communityComments).where(eq(schema.communityComments.postId, postId));
const posts = () => getDb().select().from(schema.communityPosts).where(eq(schema.communityPosts.hostelId, hostel.id));

describe('the same post or comment sent twice at once is saved once', () => {
  test('comments: both sends get the one comment back; a different text, or the same text later, is a new comment', async () => {
    const post = await call(`/hostels/${hostel.id}/community`, { token: resident.token, body: { kind: 'general', body: 'Who has a spare umbrella?' } });
    const send = (body = 'Me, room 204') => call(`/posts/${post.body.id}/comments`, { token: resident.token, body: { body } });

    // Both sends pass every check, then wait on the insert; without the guard each would save a comment.
    const latch = await holdRow('community_posts', post.body.id);
    const first = send();
    await latch.queued(1);
    const second = send();
    await latch.queued(2);
    await latch.release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(await comments(post.body.id)).toHaveLength(1);

    expect((await send('Also me, room 310')).body.id).not.toBe(a.body.id);
    setClock('2026-11-09T06:00:11Z');
    expect((await send()).body.id).not.toBe(a.body.id);
    expect(await comments(post.body.id)).toHaveLength(3);
  });

  test('posts: one post for a burst of identical sends', async () => {
    const send = () => call(`/hostels/${hostel.id}/community`, { token: resident.token, body: { kind: 'lost_found', body: 'Found a blue water bottle at the gate' } });
    const latch = await holdRow('hostels', hostel.id);
    const first = send();
    await latch.queued(1);
    const second = send();
    await latch.queued(2);
    await latch.release();
    const [a, b] = await Promise.all([first, second]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.body.id).toBe(a.body.id);
    expect(await posts()).toHaveLength(1);
  });
});
