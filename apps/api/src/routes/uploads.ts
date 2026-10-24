import { newId } from '@hostels/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { AppError, notFound } from '../lib/errors';
import { sniffImage, storage } from '../lib/storage';
import { type AppEnv, requireAuth } from '../middleware/auth';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const uploadRoutes = new Hono<AppEnv>()
  .post(
    '/uploads',
    requireAuth(),
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: (c) => c.json({ error: 'validation', message: 'Photos must be 5 MB or smaller' }, 413),
    }),
    async (c) => {
      const form = await c.req.parseBody().catch(() => null);
      const file = form?.file;
      if (!(file instanceof File)) throw new AppError('validation', 'Send the photo as multipart field "file"', 400);
      if (file.size > MAX_UPLOAD_BYTES) throw new AppError('validation', 'Photos must be 5 MB or smaller', 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = sniffImage(bytes);
      if (!ext) throw new AppError('validation', 'Only JPEG, PNG or WebP photos are accepted', 400);
      const key = `${newId('pho')}.${ext}`;
      const url = await storage.put(key, bytes, file.type);
      return c.json({ url, key }, 201);
    },
  )
  .get('/uploads/:key', async (c) => {
    const file = await storage.get(c.req.param('key'));
    if (!file) throw notFound('File');
    return c.body(file.data, 200, {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
  });
