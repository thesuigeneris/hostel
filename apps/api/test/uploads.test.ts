import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { newId } from '@hostels/shared';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { app, call, resetDb } from './helpers';

/** A real 1×1 PNG. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

type Uploaded = { key: string; path: string; url: string };

async function upload(token: string, bytes: Uint8Array, opts: { purpose?: string; name?: string; type?: string } = {}) {
  const form = new FormData();
  form.append('file', new File([bytes], opts.name ?? 'p.png', { type: opts.type ?? 'image/png' }));
  if (opts.purpose) form.append('purpose', opts.purpose);
  return app.request('/uploads', { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
}

/** Fetches a photo link the way a browser would: no session, just the URL. */
function fetchLink(link: string) {
  const u = new URL(link);
  return app.request(`${u.pathname}${u.search}`);
}

let ownerToken: string;
let adminToken: string;
let hostel: { id: string; slug: string };
let room: { id: string };
const originalPublicUrl = process.env.API_PUBLIC_URL;

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true });
  hostel = h.hostel;
  room = h.rooms[0];
  process.env.API_PUBLIC_URL = 'http://api.test';
});

afterEach(() => {
  setClock(null);
  if (originalPublicUrl === undefined) Reflect.deleteProperty(process.env, 'API_PUBLIC_URL');
  else process.env.API_PUBLIC_URL = originalPublicUrl;
});

describe('uploads', () => {
  test('checks the file signature, not the name, and refuses odd input', async () => {
    const ok = await upload(ownerToken, PNG, { purpose: 'listing', name: 'photo.jpg', type: 'image/jpeg' });
    expect(ok.status).toBe(201);
    const { key } = (await ok.json()) as Uploaded;
    expect(key).toEndWith('.png');
    const back = await app.request(`/uploads/${key}`);
    expect(back.headers.get('content-type')).toBe('image/png');

    const fake = await upload(ownerToken, new TextEncoder().encode('<script>alert(1)</script>'), { name: 'x.png' });
    expect(fake.status).toBe(400);
    const big = await upload(ownerToken, new Uint8Array(6 * 1024 * 1024).fill(0xff), { name: 'big.jpg' });
    expect(big.status).toBe(413);
    expect((await upload(ownerToken, PNG, { purpose: 'public' })).status).toBe(400);
    expect((await app.request('/uploads/../../etc/passwd')).status).toBe(404);
    expect((await app.request('/uploads', { method: 'POST', body: new FormData() })).status).toBe(401);
  });
});

describe('photo links are built when a response is made', () => {
  test('a listing photo is public, stored as a path, and follows the API address', async () => {
    const res = await upload(ownerToken, PNG, { purpose: 'listing' });
    const up = (await res.json()) as Uploaded;
    expect(up.key).toStartWith('pho_');
    expect(up).toMatchObject({ path: `/uploads/${up.key}`, url: `http://api.test/uploads/${up.key}` });

    const added = await call(`/owner/hostels/${hostel.id}/photos`, { token: ownerToken, body: { url: up.path } });
    expect(added.status).toBe(201);
    expect(added.body.url).toBe(`http://api.test/uploads/${up.key}`);
    const [row] = await getDb().select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.id, added.body.id));
    expect(row!.url).toBe(`/uploads/${up.key}`);

    // Anyone can load it, and it may be cached anywhere.
    const served = await fetchLink(added.body.url);
    expect(served.status).toBe(200);
    expect(served.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    // The API moves to a new address: the same row now links there, on the public page and in search.
    process.env.API_PUBLIC_URL = 'https://api.example.in';
    const page = await call(`/hostels/${hostel.slug}`);
    expect(page.body.photos.map((p: { url: string }) => p.url)).toEqual(['https://example.com/a.jpg', `https://api.example.in/uploads/${up.key}`]);
    await call(`/owner/hostels/${hostel.id}/photos/order`, { token: ownerToken, method: 'PUT', body: { photoIds: [added.body.id, page.body.photos[0].id] } });
    const found = await call('/hostels?area=Gachibowli');
    expect(found.body.items.find((h: { id: string }) => h.id === hostel.id).coverPhotoUrl).toBe(`https://api.example.in/uploads/${up.key}`);
  });

  test('older rows that stored an absolute link, and clients that send one, get the current address', async () => {
    const up = (await (await upload(ownerToken, PNG, { purpose: 'listing' })).json()) as Uploaded;
    // Written before links were stored relative, while the API ran on a LAN address.
    await getDb().insert(schema.hostelPhotos).values({ id: newId('pho'), hostelId: hostel.id, url: `http://192.168.1.5:4000/uploads/${up.key}`, sortOrder: 5 });
    // An older client sends back the absolute link the upload returned.
    const second = (await (await upload(ownerToken, PNG, { purpose: 'listing' })).json()) as Uploaded;
    const added = await call(`/owner/hostels/${hostel.id}/photos`, { token: ownerToken, body: { url: second.url } });
    const [row] = await getDb().select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.id, added.body.id));
    expect(row!.url).toBe(`/uploads/${second.key}`);

    const urls = (await call(`/hostels/${hostel.slug}`)).body.photos.map((p: { url: string }) => p.url);
    expect(urls).toContain(`http://api.test/uploads/${up.key}`);
    expect(urls).toContain(`http://api.test/uploads/${second.key}`);
  });
});

describe('issue and community photos are private to the hostel', () => {
  test('only residents, the owner and admins get a working link; everyone else gets 404', async () => {
    const resident = await newTenant('Asha');
    await activeSubscriber(resident.token, hostel.id, room.id);
    const outsider = await newTenant('Out');

    const res = await upload(resident.token, PNG); // no purpose: private by default
    const up = (await res.json()) as Uploaded;
    expect(up.key).toStartWith('att_');
    expect((await app.request(up.path)).status).toBe(404);

    const issue = await call(`/hostels/${hostel.id}/issues`, { token: resident.token, body: { category: 'water', title: 'Leaking tap', photoUrl: up.path } });
    expect(issue.status).toBe(201);
    const [row] = await getDb().select().from(schema.issues).where(eq(schema.issues.id, issue.body.id));
    expect(row!.photoUrl).toBe(up.path);

    // The resident, the owner and an admin each get a signed link that loads, privately cached.
    for (const token of [resident.token, ownerToken, adminToken]) {
      const seen = await call(`/issues/${issue.body.id}`, { token });
      expect(seen.status).toBe(200);
      expect(seen.body.photoUrl).toStartWith(`http://api.test/uploads/${up.key}?exp=`);
      const img = await fetchLink(seen.body.photoUrl);
      expect(img.status).toBe(200);
      expect(img.headers.get('content-type')).toBe('image/png');
      expect(img.headers.get('cache-control')).toMatch(/^private, max-age=\d+$/);
    }

    // An outsider can't read the issue, can't load the bare file, and can't forge or stretch a link.
    expect((await call(`/issues/${issue.body.id}`, { token: outsider.token })).body.error).toBe('not_a_resident');
    const link = new URL((await call(`/issues/${issue.body.id}`, { token: resident.token })).body.photoUrl);
    expect((await app.request(link.pathname)).status).toBe(404);
    const forged = new URL(link);
    forged.searchParams.set('sig', '0'.repeat(32));
    expect((await fetchLink(forged.toString())).status).toBe(404);
    const stretched = new URL(link);
    stretched.searchParams.set('exp', String(Number(link.searchParams.get('exp')) + 86_400));
    expect((await fetchLink(stretched.toString())).status).toBe(404);
    // A link stops working within 90 minutes.
    setClock('2026-11-09T07:31:00Z');
    expect((await fetchLink(link.toString())).status).toBe(404);
  });

  test('community posts work the same way', async () => {
    const resident = await newTenant('Asha');
    await activeSubscriber(resident.token, hostel.id, room.id);
    const up = (await (await upload(resident.token, PNG, { purpose: 'attachment' })).json()) as Uploaded;
    const post = await call(`/hostels/${hostel.id}/community`, { token: resident.token, body: { body: 'Our new plant', photoUrl: up.path } });
    expect(post.status).toBe(201);
    expect(post.body.photoUrl).toStartWith(`http://api.test/uploads/${up.key}?exp=`);
    const feed = await call(`/hostels/${hostel.id}/community`, { token: ownerToken });
    expect((await fetchLink(feed.body[0].photoUrl)).status).toBe(200);
    expect((await app.request(up.path)).status).toBe(404);
  });

  test('attachments must be private uploads, and listing photos must not be', async () => {
    const resident = await newTenant('Asha');
    await activeSubscriber(resident.token, hostel.id, room.id);
    const listing = (await (await upload(ownerToken, PNG, { purpose: 'listing' })).json()) as Uploaded;
    const attachment = (await (await upload(resident.token, PNG)).json()) as Uploaded;

    // An outside link would let a third party see who opens the issue; a public upload would be visible to anyone.
    for (const photoUrl of ['https://tracker.example/pixel.png', listing.path]) {
      const res = await call(`/hostels/${hostel.id}/issues`, { token: resident.token, body: { category: 'water', title: 'Leaking tap', photoUrl } });
      expect(res.status).toBe(400);
      expect((await call(`/hostels/${hostel.id}/community`, { token: resident.token, body: { body: 'Hi', photoUrl } })).status).toBe(400);
    }
    // A private attachment put on the public listing would never load there.
    expect((await call(`/owner/hostels/${hostel.id}/photos`, { token: ownerToken, body: { url: attachment.path } })).status).toBe(400);
  });
});
