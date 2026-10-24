import { Hono } from 'hono';
import { randomToken } from '../lib/crypto';
import { requireAuth } from '../lib/auth';
import { err } from '../lib/http';
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, sniffImageType, storage } from '../lib/storage';
import type { AppEnv } from '../lib/types';

/** Photo uploads (POST /uploads) and static serving (/uploads/*). */
export const uploadsRoutes = new Hono<AppEnv>()
  .post('/uploads', requireAuth, async (c) => {
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw err.validation('Photos must be 5 MB or smaller', [{ path: 'file', message: 'Too large' }]);
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      throw err.validation('Send the photo as multipart/form-data in a field named "file"');
    }
    const file = form.get('file');
    if (!(file instanceof Blob)) throw err.validation('Choose a photo to upload', [{ path: 'file', message: 'Required' }]);
    if (file.size > MAX_UPLOAD_BYTES) throw err.validation('Photos must be 5 MB or smaller', [{ path: 'file', message: 'Too large' }]);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) throw err.validation('Only JPEG, PNG or WebP photos are allowed', [{ path: 'file', message: 'Unsupported file type' }]);
    const url = await storage.put(`${randomToken(16)}.${IMAGE_TYPES[type]}`, bytes, type);
    return c.json({ url });
  })
  .get('/uploads/:name', async (c) => {
    const f = await storage.get(c.req.param('name'));
    if (!f) throw err.notFound('File');
    return c.body(f.bytes as unknown as ArrayBuffer, 200, {
      'Content-Type': f.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
  });
