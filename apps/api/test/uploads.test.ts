import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, login, req, truncateAll } from './helpers';
import { PNG_BYTES } from './community-fixtures';

const dir = mkdtempSync(path.join(tmpdir(), 'hostels-uploads-'));
process.env.UPLOAD_DIR = dir;

beforeEach(truncateAll);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function form(bytes: Uint8Array, name = 'photo.png', type = 'image/png') {
  const fd = new FormData();
  fd.append('file', new Blob([bytes as BlobPart], { type }), name);
  return fd;
}

describe('uploads', () => {
  test('requires sign-in', async () => {
    expect((await req('POST', '/uploads', { body: form(PNG_BYTES) })).status).toBe(401);
  });

  test('stores a PNG and serves it back with the right type', async () => {
    const { token } = await login();
    const r = await req('POST', '/uploads', { token, body: form(PNG_BYTES) });
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/^http:\/\/localhost:\d+\/uploads\/[a-f0-9]{32}\.png$/);
    const name = r.body.url.split('/').pop();
    const res = await app.request(`/uploads/${name}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
  });

  test('detects type from the file signature, not the declared type', async () => {
    const { token } = await login();
    const fake = await req('POST', '/uploads', { token, body: form(new TextEncoder().encode('<script>alert(1)</script>'), 'x.png', 'image/png') });
    expect(fake.status).toBe(400);
    expect(fake.body.issues[0].message).toBe('Unsupported file type');

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const asText = await req('POST', '/uploads', { token, body: form(jpeg, 'x.txt', 'text/plain') });
    expect(asText.body.url).toMatch(/\.jpg$/);

    const webp = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBPVP8 ')]);
    expect((await req('POST', '/uploads', { token, body: form(webp, 'x.webp', 'image/webp') })).body.url).toMatch(/\.webp$/);
  });

  test('rejects files over 5 MB and missing files', async () => {
    const { token } = await login();
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG_BYTES);
    expect((await req('POST', '/uploads', { token, body: form(big) })).status).toBe(400);
    expect((await req('POST', '/uploads', { token, body: new FormData() })).status).toBe(400);
  });

  test('never serves files outside the upload directory', async () => {
    for (const p of ['/uploads/..%2F..%2Fpackage.json', '/uploads/%2e%2e%2fpackage.json', '/uploads/nope.png', '/uploads/package.json']) {
      expect((await app.request(p)).status).toBe(404);
    }
  });
});
