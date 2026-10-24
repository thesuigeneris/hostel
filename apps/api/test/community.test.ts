import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db';
import { ratingSummary } from '../src/services/reputation';
import { login, loginAdmin, req, truncateAll } from './helpers';
import { issueBody, ownerWithHostel, resident, reviewBody, today } from './community-fixtures';

beforeEach(truncateAll);

describe('residencies', () => {
  test('my residencies include hostel summaries; claims need a live hostel', async () => {
    const { hostel } = await ownerWithHostel();
    const draft = await ownerWithHostel({ status: 'draft' });
    const u = await login('tenant');
    expect((await req('POST', '/me/residencies', { token: u.token, body: { hostelId: draft.hostel.id, startDate: today() } })).status).toBe(404);
    await req('POST', '/me/residencies', { token: u.token, body: { hostelId: hostel.id, startDate: today() } });
    const mine = await req('GET', '/me/residencies', { token: u.token });
    expect(mine.body.residencies).toHaveLength(1);
    expect(mine.body.residencies[0]).toMatchObject({ status: 'pending', hostel: { id: hostel.id, slug: hostel.slug, minRent: 9000 } });
    expect((await req('GET', '/me/residencies')).status).toBe(401);
  });

  test('residents directory never exposes phone numbers', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const a = await resident(hostel.id, 'Asha');
    await resident(hostel.id, 'Bharat');
    await resident(hostel.id, 'Gone', 'ended');
    const dir = await req('GET', `/community/${hostel.id}/residents`, { token: a.token });
    expect(dir.body.map((r: any) => r.name).sort()).toEqual(['Asha', 'Bharat']);
    expect(JSON.stringify(dir.body)).not.toContain(a.user.phone);
    expect((await req('GET', `/community/${hostel.id}/residents`, { token: owner.token })).status).toBe(200);
  });
});

describe('community board', () => {
  test('only active residents, the owner and admins can read or post', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const outsider = await login('tenant');
    const pending = await resident(hostel.id, 'Pending', 'pending');
    const past = await resident(hostel.id, 'Past', 'ended');
    for (const t of [outsider, pending, past]) {
      const r = await req('GET', `/community/${hostel.id}/posts`, { token: t.token });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('not_resident');
    }
    const r = await resident(hostel.id);
    expect((await req('POST', `/community/${hostel.id}/posts`, { token: r.token, body: { body: 'Hello all' } })).status).toBe(201);
    expect((await req('GET', `/community/${hostel.id}/posts`, { token: owner.token })).body.items).toHaveLength(1);
    const admin = await loginAdmin();
    expect((await req('GET', `/community/${hostel.id}/posts`, { token: admin.token })).body.total).toBe(1);
    expect((await req('GET', '/community/hst_nope/posts', { token: r.token })).status).toBe(404);
  });

  test('comments, likes and deletion rules', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const a = await resident(hostel.id, 'Asha');
    const b = await resident(hostel.id, 'Bharat');
    const post = (await req('POST', `/community/${hostel.id}/posts`, { token: a.token, body: { body: 'Lost a blue umbrella' } })).body;
    expect(post).toMatchObject({ kind: 'post', author: { name: 'Asha', role: 'tenant' }, likes: 0, commentCount: 0, pinned: false });

    expect((await req('POST', `/posts/${post.id}/like`, { token: b.token })).body).toEqual({ liked: true, likes: 1 });
    expect((await req('POST', `/posts/${post.id}/like`, { token: a.token })).body).toEqual({ liked: true, likes: 2 });
    expect((await req('POST', `/posts/${post.id}/like`, { token: b.token })).body).toEqual({ liked: false, likes: 1 });

    const comment = await req('POST', `/posts/${post.id}/comments`, { token: b.token, body: { body: 'Saw it in the lounge' } });
    expect(comment.body.author.name).toBe('Bharat');
    const detail = await req('GET', `/posts/${post.id}`, { token: a.token });
    expect(detail.body).toMatchObject({ likes: 1, likedByMe: true, commentCount: 1 });
    expect(detail.body.comments[0].body).toBe('Saw it in the lounge');

    const outsider = await login('tenant');
    expect((await req('POST', `/posts/${post.id}/comments`, { token: outsider.token, body: { body: 'hi' } })).status).toBe(403);
    expect((await req('DELETE', `/posts/${post.id}`, { token: b.token })).status).toBe(403);
    expect((await req('DELETE', `/posts/${post.id}`, { token: owner.token })).status).toBe(200);
    expect((await req('GET', `/posts/${post.id}`, { token: a.token })).status).toBe(404);

    const own = (await req('POST', `/community/${hostel.id}/posts`, { token: b.token, body: { body: 'Mine' } })).body;
    expect((await req('DELETE', `/posts/${own.id}`, { token: b.token })).status).toBe(200);
  });
});

describe('issues', () => {
  test('only active residents can report', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const outsider = await login('tenant');
    const past = await resident(hostel.id, 'Past', 'ended');
    for (const t of [outsider, past, owner]) {
      const r = await req('POST', `/community/${hostel.id}/issues`, { token: t.token, body: issueBody });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('not_resident');
    }
    const r = await resident(hostel.id);
    const created = await req('POST', `/community/${hostel.id}/issues`, { token: r.token, body: issueBody });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'open', isPublic: true, anonymous: false, upvotes: 0, reporter: { id: r.user.id } });
  });

  test('anonymous reporters are hidden from everyone but themselves and admins', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const reporter = await resident(hostel.id, 'Secret Reporter');
    const other = await resident(hostel.id, 'Neighbour');
    const issue = (await req('POST', `/community/${hostel.id}/issues`, { token: reporter.token, body: { ...issueBody, anonymous: true } })).body;
    await req('POST', `/issues/${issue.id}/comments`, { token: reporter.token, body: { body: 'Still happening tonight' } });

    expect((await req('GET', `/issues/${issue.id}`, { token: reporter.token })).body.reporter.id).toBe(reporter.user.id);
    const admin = await loginAdmin();
    expect((await req('GET', `/issues/${issue.id}`, { token: admin.token })).body.reporter.id).toBe(reporter.user.id);
    for (const t of [owner, other]) {
      const d = await req('GET', `/issues/${issue.id}`, { token: t.token });
      expect(d.body.reporter).toBeNull();
      expect(JSON.stringify(d.body)).not.toContain(reporter.user.id);
      expect(JSON.stringify(d.body)).not.toContain('Secret Reporter');
      expect(d.body.comments[0].author.name).toBe('Anonymous resident');
    }
    const ownerList = await req('GET', `/owner/hostels/${hostel.id}/issues`, { token: owner.token });
    expect(ownerList.body.items[0].reporter).toBeNull();
    const boardList = await req('GET', `/community/${hostel.id}/issues`, { token: other.token });
    expect(boardList.body.items[0].reporter).toBeNull();
  });

  test('outsiders cannot read issues, but the reporter still can after moving out', async () => {
    const { hostel } = await ownerWithHostel();
    const r = await resident(hostel.id);
    const issue = (await req('POST', `/community/${hostel.id}/issues`, { token: r.token, body: issueBody })).body;
    const outsider = await login('tenant');
    expect((await req('GET', `/issues/${issue.id}`, { token: outsider.token })).status).toBe(403);
    expect((await req('GET', `/community/${hostel.id}/issues`, { token: outsider.token })).status).toBe(403);
    await db.update(schema.residencies).set({ status: 'ended' }).where(eq(schema.residencies.id, r.residency.id));
    expect((await req('GET', `/issues/${issue.id}`, { token: r.token })).status).toBe(200);
  });

  test('status flow: owner moves forward, reporter confirms or reopens', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const reporter = await resident(hostel.id);
    const other = await resident(hostel.id);
    const id = (await req('POST', `/community/${hostel.id}/issues`, { token: reporter.token, body: issueBody })).body.id;
    const move = (token: string, status: string, note?: string) => req('POST', `/issues/${id}/status`, { token, body: { status, note } });

    expect((await move(reporter.token, 'acknowledged')).body.error).toBe('invalid_transition');
    expect((await move(other.token, 'resolved')).body.error).toBe('invalid_transition');
    expect((await move(owner.token, 'closed')).body.error).toBe('invalid_transition');

    const ack = await move(owner.token, 'acknowledged', 'Technician booked for tomorrow');
    expect(ack.body.status).toBe('acknowledged');
    expect(ack.body.acknowledgedAt).not.toBeNull();
    expect((await move(owner.token, 'acknowledged')).body.error).toBe('invalid_transition');
    expect((await move(owner.token, 'in_progress')).body.status).toBe('in_progress');
    expect((await move(reporter.token, 'closed')).body.error).toBe('invalid_transition');
    const resolved = await move(owner.token, 'resolved');
    expect(resolved.body.resolvedAt).not.toBeNull();

    expect((await move(other.token, 'closed')).body.error).toBe('invalid_transition');
    const reopened = await move(reporter.token, 'open', 'Dropped again last night');
    expect(reopened.body).toMatchObject({ status: 'open', resolvedAt: null });

    await move(owner.token, 'resolved');
    const closed = await move(reporter.token, 'closed');
    expect(closed.body.status).toBe('closed');
    expect(closed.body.closedAt).not.toBeNull();
    expect((await move(owner.token, 'open')).body.error).toBe('invalid_transition');

    const detail = await req('GET', `/issues/${id}`, { token: reporter.token });
    expect(detail.body.comments.map((c: any) => c.body)).toEqual(['Technician booked for tomorrow', 'Dropped again last night']);
    expect(detail.body.comments[0].isOwner).toBe(true);
    expect(detail.body.comments[1].isOwner).toBe(false);

    const [row] = await db.select().from(schema.issues).where(eq(schema.issues.id, id));
    expect(row!.firstResponseAt).not.toBeNull();
  });

  test('an owner comment counts as first response; resident comments do not', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const r = await resident(hostel.id);
    const id = (await req('POST', `/community/${hostel.id}/issues`, { token: r.token, body: issueBody })).body.id;
    await req('POST', `/issues/${id}/comments`, { token: r.token, body: { body: 'Any update?' } });
    let [row] = await db.select().from(schema.issues).where(eq(schema.issues.id, id));
    expect(row!.firstResponseAt).toBeNull();
    await req('POST', `/issues/${id}/comments`, { token: owner.token, body: { body: 'Router replaced' } });
    [row] = await db.select().from(schema.issues).where(eq(schema.issues.id, id));
    expect(row!.firstResponseAt).not.toBeNull();
    expect(row!.status).toBe('open');
  });

  test('admin can move an issue either way', async () => {
    const { hostel } = await ownerWithHostel();
    const r = await resident(hostel.id);
    const id = (await req('POST', `/community/${hostel.id}/issues`, { token: r.token, body: issueBody })).body.id;
    const admin = await loginAdmin();
    expect((await req('POST', `/issues/${id}/status`, { token: admin.token, body: { status: 'resolved' } })).body.status).toBe('resolved');
    expect((await req('POST', `/issues/${id}/status`, { token: admin.token, body: { status: 'closed' } })).body.status).toBe('closed');
  });

  test('upvotes are toggled by residents only', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const a = await resident(hostel.id);
    const b = await resident(hostel.id);
    const id = (await req('POST', `/community/${hostel.id}/issues`, { token: a.token, body: issueBody })).body.id;
    expect((await req('POST', `/issues/${id}/upvote`, { token: b.token })).body).toEqual({ upvoted: true, upvotes: 1 });
    expect((await req('POST', `/issues/${id}/upvote`, { token: a.token })).body).toEqual({ upvoted: true, upvotes: 2 });
    expect((await req('POST', `/issues/${id}/upvote`, { token: b.token })).body).toEqual({ upvoted: false, upvotes: 1 });
    expect((await req('POST', `/issues/${id}/upvote`, { token: owner.token })).status).toBe(403);
    const list = await req('GET', `/community/${hostel.id}/issues`, { token: a.token });
    expect(list.body.items[0]).toMatchObject({ upvotes: 1, upvotedByMe: true });
  });

  test('issue list filters by status and category', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const r = await resident(hostel.id);
    await req('POST', `/community/${hostel.id}/issues`, { token: r.token, body: issueBody });
    const food = (await req('POST', `/community/${hostel.id}/issues`, { token: r.token, body: { ...issueBody, category: 'food', title: 'Rice undercooked' } })).body;
    await req('POST', `/issues/${food.id}/status`, { token: owner.token, body: { status: 'resolved' } });
    expect((await req('GET', `/community/${hostel.id}/issues?category=food`, { token: r.token })).body.total).toBe(1);
    expect((await req('GET', `/community/${hostel.id}/issues?status=open`, { token: r.token })).body.items[0].category).toBe('wifi');
    expect((await req('GET', `/owner/hostels/${hostel.id}/issues?status=resolved`, { token: owner.token })).body.total).toBe(1);
    expect((await req('GET', `/community/${hostel.id}/issues?status=bogus`, { token: r.token })).status).toBe(400);
  });
});

describe('reviews', () => {
  test('only current or past residents can review, once', async () => {
    const { hostel } = await ownerWithHostel();
    const outsider = await login('tenant');
    const pending = await resident(hostel.id, 'Pending', 'pending');
    for (const t of [outsider, pending]) {
      const r = await req('POST', `/hostels/${hostel.id}/reviews`, { token: t.token, body: reviewBody });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('not_resident');
    }
    const past = await resident(hostel.id, 'Past Resident', 'ended');
    const ok = await req('POST', `/hostels/${hostel.id}/reviews`, { token: past.token, body: reviewBody });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      verifiedResident: true,
      author: { name: 'Past Resident' },
      stayedFrom: past.residency.startDate,
      stayedTo: past.residency.endDate,
      status: 'published',
      ownerReply: null,
    });
    const dup = await req('POST', `/hostels/${hostel.id}/reviews`, { token: past.token, body: reviewBody });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('already_reviewed');
    expect((await req('POST', `/hostels/${hostel.id}/reviews`)).status).toBe(401);
  });

  test('food score is required where food is served and dropped where it is not', async () => {
    const withFood = await ownerWithHostel({ foodAvailable: true });
    const r = await resident(withFood.hostel.id);
    const { food: _f, ...noFood } = reviewBody;
    const missing = await req('POST', `/hostels/${withFood.hostel.id}/reviews`, { token: r.token, body: noFood });
    expect(missing.status).toBe(400);
    expect(missing.body.issues[0].path).toBe('food');

    const without = await ownerWithHostel({ foodAvailable: false });
    const r2 = await resident(without.hostel.id);
    const ok = await req('POST', `/hostels/${without.hostel.id}/reviews`, { token: r2.token, body: reviewBody });
    expect(ok.body.food).toBeNull();
  });

  test('validation of scores and text', async () => {
    const { hostel } = await ownerWithHostel();
    const r = await resident(hostel.id);
    const bad = await req('POST', `/hostels/${hostel.id}/reviews`, { token: r.token, body: { ...reviewBody, overall: 6, body: 'too short' } });
    expect(bad.status).toBe(400);
    expect(bad.body.issues.map((i: any) => i.path).sort()).toEqual(['body', 'overall']);
  });

  test('authors can edit; ratings feed the summary; mine lists them', async () => {
    const { hostel } = await ownerWithHostel();
    const a = await resident(hostel.id);
    const b = await resident(hostel.id);
    const ra = (await req('POST', `/hostels/${hostel.id}/reviews`, { token: a.token, body: reviewBody })).body;
    await req('POST', `/hostels/${hostel.id}/reviews`, { token: b.token, body: { ...reviewBody, overall: 2, food: 3 } });
    expect((await ratingSummary(hostel.id)).overall).toBe(3);

    expect((await req('PATCH', `/reviews/${ra.id}`, { token: b.token, body: reviewBody })).status).toBe(404);
    const edited = await req('PATCH', `/reviews/${ra.id}`, { token: a.token, body: { ...reviewBody, overall: 5, title: 'Even better now' } });
    expect(edited.body).toMatchObject({ overall: 5, title: 'Even better now' });
    const s = await ratingSummary(hostel.id);
    expect(s).toMatchObject({ count: 2, overall: 3.5, food: 4 });

    const mine = await req('GET', '/me/reviews', { token: a.token });
    expect(mine.body).toHaveLength(1);
  });
});
