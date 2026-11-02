import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { newId } from '@hostels/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, PNG, uploadPhoto } from './fixtures';
import { app, call, resetDb } from './helpers';

type Uploaded = { upload: string; url: string };

async function upload(token: string, bytes: Uint8Array, opts: { purpose?: string; name?: string; type?: string } = {}) {
  const form = new FormData();
  form.append('file', new File([bytes], opts.name ?? 'p.png', { type: opts.type ?? 'image/png' }));
  if (opts.purpose) form.append('purpose', opts.purpose);
  return app.request('/uploads', { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
}

/** The stored file's key, from the link the upload returned. */
const keyOf = (up: Uploaded) => new URL(up.url).pathname.split('/').pop()!;

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
  process.env.API_PUBLIC_URL = 'http://api.test';
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true });
  hostel = h.hostel;
  room = h.rooms[0];
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
    const up = (await ok.json()) as Uploaded;
    expect(keyOf(up)).toEndWith('.png');
    expect((await fetchLink(up.url)).headers.get('content-type')).toBe('image/png');

    const fake = await upload(ownerToken, new TextEncoder().encode('<script>alert(1)</script>'), { name: 'x.png' });
    expect(fake.status).toBe(400);
    const big = await upload(ownerToken, new Uint8Array(6 * 1024 * 1024).fill(0xff), { name: 'big.jpg' });
    expect(big.status).toBe(413);
    expect((await upload(ownerToken, PNG, { purpose: 'public' })).status).toBe(400);
    expect((await app.request('/uploads/../../etc/passwd')).status).toBe(404);
    expect((await app.request('/uploads', { method: 'POST', body: new FormData() })).status).toBe(401);
  });
});

describe('photos are your own uploads, made for the purpose', () => {
  const addPhoto = (token: string, photo: string) => call(`/owner/hostels/${hostel.id}/photos`, { token, body: { photo } });
  const report = (token: string, photo: string) =>
    call(`/hostels/${hostel.id}/issues`, { token, body: { category: 'water', title: 'Leaking tap', photo } });
  const post = (token: string, photo: string) => call(`/hostels/${hostel.id}/community`, { token, body: { body: 'Look at this', photo } });

  test('an owner can only add listing photos they uploaded', async () => {
    const mine = await uploadPhoto(ownerToken, 'listing');
    const theirs = await uploadPhoto(await newOwner(), 'listing');
    const privateOne = await uploadPhoto(ownerToken, 'attachment');

    // Outside links (stock photos, trackers), and bare paths or links to uploads, are not receipts.
    for (const photo of ['https://images.example.com/stock.jpg', `/uploads/${keyOf(mine)}`, mine.url]) {
      expect((await addPhoto(ownerToken, photo)).status).toBe(400);
    }
    // Someone else's receipt, or their key with my signature moved onto it, doesn't verify for me.
    const theirsRes = await addPhoto(ownerToken, theirs.upload);
    expect(theirsRes.status).toBe(400);
    expect(theirsRes.body.message).toBe('Upload the photo again, then attach it');
    expect((await addPhoto(ownerToken, `${keyOf(theirs)}.${mine.upload.split('.').pop()}`)).status).toBe(400);
    // A private attachment can't be published on the listing.
    const wrongPurpose = await addPhoto(ownerToken, privateOne.upload);
    expect(wrongPurpose.status).toBe(400);
    expect(wrongPurpose.body.message).toContain('private attachment');

    expect((await addPhoto(ownerToken, mine.upload)).status).toBe(201);
    expect((await call(`/hostels/${hostel.slug}`)).body.photos).toHaveLength(2);
  });

  test('receipts are signed with their own secret: rotating the OTP pepper keeps them, rotating the signing secret voids them', async () => {
    const saved = { pepper: process.env.OTP_PEPPER, signing: process.env.UPLOAD_SIGNING_SECRET };
    const restore = (name: 'OTP_PEPPER' | 'UPLOAD_SIGNING_SECRET', value: string | undefined) => {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    };
    try {
      const first = await uploadPhoto(ownerToken, 'listing');
      process.env.OTP_PEPPER = 'rotated-otp-pepper-'.padEnd(40, 'x');
      expect((await addPhoto(ownerToken, first.upload)).status).toBe(201);

      const second = await uploadPhoto(ownerToken, 'listing');
      process.env.UPLOAD_SIGNING_SECRET = 'rotated-signing-secret-'.padEnd(40, 'y');
      const refused = await addPhoto(ownerToken, second.upload);
      expect(refused.status).toBe(400);
      expect(refused.body.message).toBe('Upload the photo again, then attach it');
    } finally {
      restore('OTP_PEPPER', saved.pepper);
      restore('UPLOAD_SIGNING_SECRET', saved.signing);
    }
  });

  test("a resident can only attach their own private uploads, never someone else's or a public one", async () => {
    const [resident, neighbour] = await Promise.all([newTenant('Asha'), newTenant('Bina')]);
    await activeSubscriber(resident.token, hostel.id, room.id);
    await activeSubscriber(neighbour.token, hostel.id, room.id);
    const neighbours = await uploadPhoto(neighbour.token, 'attachment');
    const publicOne = await uploadPhoto(resident.token, 'listing');
    const mine = await uploadPhoto(resident.token);

    for (const photo of ['https://tracker.example/pixel.png', neighbours.upload, `/uploads/${keyOf(mine)}`]) {
      expect((await report(resident.token, photo)).status).toBe(400);
      expect((await post(resident.token, photo)).status).toBe(400);
    }
    const wrongPurpose = await report(resident.token, publicOne.upload);
    expect(wrongPurpose.status).toBe(400);
    expect(wrongPurpose.body.message).toContain('public listing photo');
    expect((await post(resident.token, publicOne.upload)).status).toBe(400);

    expect((await report(resident.token, mine.upload)).status).toBe(201);
    expect((await post(resident.token, mine.upload)).status).toBe(201);
  });
});

describe('photo links are built when a response is made', () => {
  test('a listing photo is public, stored as a path, and follows the API address', async () => {
    const up = await uploadPhoto(ownerToken, 'listing');
    const key = keyOf(up);
    expect(key).toStartWith('pho_');
    expect(up.url).toBe(`http://api.test/uploads/${key}`);

    const added = await call(`/owner/hostels/${hostel.id}/photos`, { token: ownerToken, body: { photo: up.upload } });
    expect(added.status).toBe(201);
    expect(added.body.url).toBe(`http://api.test/uploads/${key}`);
    const [row] = await getDb().select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.id, added.body.id));
    expect(row!.url).toBe(`/uploads/${key}`);

    // Anyone can load it, and it may be cached anywhere.
    const served = await fetchLink(added.body.url);
    expect(served.status).toBe(200);
    expect(served.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    // The API moves to a new address: the same rows now link there, on the public page and in search.
    process.env.API_PUBLIC_URL = 'https://api.example.in';
    const page = await call(`/hostels/${hostel.slug}`);
    const urls: string[] = page.body.photos.map((p: { url: string }) => p.url);
    expect(urls).toHaveLength(2);
    for (const u of urls) expect(u).toStartWith('https://api.example.in/uploads/pho_');
    expect(urls[1]).toBe(`https://api.example.in/uploads/${key}`);
    await call(`/owner/hostels/${hostel.id}/photos/order`, { token: ownerToken, method: 'PUT', body: { photoIds: [added.body.id, page.body.photos[0].id] } });
    const found = await call('/hostels?area=Gachibowli');
    expect(found.body.items.find((h: { id: string }) => h.id === hostel.id).coverPhotoUrl).toBe(`https://api.example.in/uploads/${key}`);
  });

  test('older rows that stored an absolute link get the current address', async () => {
    const key = keyOf(await uploadPhoto(ownerToken, 'listing'));
    // Written before photos were stored relative, while the API ran on a LAN address.
    await getDb().insert(schema.hostelPhotos).values({ id: newId('pho'), hostelId: hostel.id, url: `http://192.168.1.5:4000/uploads/${key}`, sortOrder: 5 });
    const urls = (await call(`/hostels/${hostel.slug}`)).body.photos.map((p: { url: string }) => p.url);
    expect(urls).toContain(`http://api.test/uploads/${key}`);
  });
});

describe('issue and community photos are private to the hostel', () => {
  test('only residents, the owner and admins get a working link; everyone else gets 404', async () => {
    const resident = await newTenant('Asha');
    await activeSubscriber(resident.token, hostel.id, room.id);
    const outsider = await newTenant('Out');

    const up = await uploadPhoto(resident.token); // no purpose: private by default
    const key = keyOf(up);
    expect(key).toStartWith('att_');
    expect((await app.request(`/uploads/${key}`)).status).toBe(404);

    const issue = await call(`/hostels/${hostel.id}/issues`, { token: resident.token, body: { category: 'water', title: 'Leaking tap', photo: up.upload } });
    expect(issue.status).toBe(201);
    const [row] = await getDb().select().from(schema.issues).where(eq(schema.issues.id, issue.body.id));
    expect(row!.photoUrl).toBe(`/uploads/${key}`);

    // The resident, the owner and an admin each get a signed link that loads, privately cached.
    for (const token of [resident.token, ownerToken, adminToken]) {
      const seen = await call(`/issues/${issue.body.id}`, { token });
      expect(seen.status).toBe(200);
      expect(seen.body.photoUrl).toStartWith(`http://api.test/uploads/${key}?exp=`);
      const img = await fetchLink(seen.body.photoUrl);
      expect(img.status).toBe(200);
      expect(img.headers.get('content-type')).toBe('image/png');
      expect(img.headers.get('cache-control')).toMatch(/^private, max-age=\d+$/);
    }

    // An outsider can't read the issue, can't load the bare file, and can't forge or stretch a link.
    expect((await call(`/issues/${issue.body.id}`, { token: outsider.token })).status).toBe(404);
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
    const up = await uploadPhoto(resident.token, 'attachment');
    const created = await call(`/hostels/${hostel.id}/community`, { token: resident.token, body: { body: 'Our new plant', photo: up.upload } });
    expect(created.status).toBe(201);
    expect(created.body.photoUrl).toStartWith(`http://api.test/uploads/${keyOf(up)}?exp=`);
    const feed = await call(`/hostels/${hostel.id}/community`, { token: ownerToken });
    expect((await fetchLink(feed.body[0].photoUrl)).status).toBe(200);
    expect((await app.request(`/uploads/${keyOf(up)}`)).status).toBe(404);
  });
});

describe('photo metadata is removed on upload', () => {
  const MARKER = 'SECRET-MARKER';
  const ascii = (s: string) => new TextEncoder().encode(s);
  const contains = (bytes: Uint8Array, s: string) => Buffer.from(bytes).includes(s);

  /** A 40×20 photo as a phone saves it: EXIF with GPS position and an owner tag, turned sideways by the orientation tag. */
  const phonePhoto = async (format: 'jpeg' | 'png' | 'webp') =>
    new Uint8Array(
      await sharp({ create: { width: 40, height: 20, channels: 3, background: '#c33' } })
        [format]()
        .withExif({ IFD0: { Artist: MARKER }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '17/1 26/1 1234/100', GPSLongitudeRef: 'E', GPSLongitude: '78/1 21/1 0/1' } })
        .withMetadata({ orientation: 6 })
        .toBuffer(),
    );

  /** Inserts a PNG chunk (e.g. tEXt) before IEND, with its CRC. */
  function withPngChunk(png: Uint8Array, type: string, data: Uint8Array) {
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    chunk.set(ascii(type), 4);
    chunk.set(data, 8);
    view.setUint32(8 + data.length, Bun.hash.crc32(chunk.subarray(4, 8 + data.length)));
    const iend = png.length - 12;
    return new Uint8Array([...png.subarray(0, iend), ...chunk, ...png.subarray(iend)]);
  }

  async function stored(bytes: Uint8Array, name: string) {
    const res = await upload(ownerToken, bytes, { purpose: 'listing', name });
    expect(res.status).toBe(201);
    return new Uint8Array(await (await fetchLink(((await res.json()) as Uploaded).url)).arrayBuffer());
  }

  for (const format of ['jpeg', 'png', 'webp'] as const) {
    test(`${format}: EXIF and GPS are gone and the photo keeps its upright orientation`, async () => {
      const original = await phonePhoto(format);
      const before = await sharp(original).metadata();
      expect(before).toMatchObject({ width: 40, height: 20, orientation: 6 });
      expect(before.exif?.length).toBeGreaterThan(0);
      expect(contains(original, MARKER)).toBe(true);

      const kept = await stored(original, `p.${format}`);
      const after = await sharp(kept).metadata();
      expect(after.format).toBe(format);
      expect(after).toMatchObject({ width: 20, height: 40 });
      expect(after.orientation).toBeUndefined();
      expect(after.exif).toBeUndefined();
      expect(after.xmp).toBeUndefined();
      expect(after.icc).toBeUndefined();
      expect(contains(kept, MARKER)).toBe(false);
    });
  }

  test('png text chunks and bytes hidden after a jpeg go too; a broken image is refused', async () => {
    const png = withPngChunk(await phonePhoto('png'), 'tEXt', ascii(`Comment\0${MARKER}`));
    expect((await sharp(png).metadata()).width).toBe(40);
    expect(contains(await stored(png, 'p.png'), MARKER)).toBe(false);

    const jpeg = new Uint8Array([...(await phonePhoto('jpeg')), ...ascii(`<script>${MARKER}</script>`)]);
    expect(contains(await stored(jpeg, 'p.jpg'), MARKER)).toBe(false);

    const broken = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const res = await upload(ownerToken, broken, { name: 'p.png' });
    expect(res.status).toBe(400);
  });
});
