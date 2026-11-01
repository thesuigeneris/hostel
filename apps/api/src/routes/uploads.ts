import { newId } from '@hostels/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { AppError, notFound } from '../lib/errors';
import { stripMetadata } from '../lib/images';
import { sniffImage, storage } from '../lib/storage';
import { isPrivateKey, isUploadKey, photoUrl, signedLinkSecondsLeft, uploadPath, uploadPrefix, uploadReceipt } from '../lib/uploads';
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
      // Private unless asked otherwise, so a client that forgets to say can't publish a resident's photo.
      const purpose = form?.purpose ?? 'attachment';
      if (purpose !== 'listing' && purpose !== 'attachment') {
        throw new AppError('validation', 'purpose must be "listing" or "attachment"', 400);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = sniffImage(bytes);
      if (!ext) throw new AppError('validation', 'Only JPEG, PNG or WebP photos are accepted', 400);
      // Phone photos carry GPS and device details; only the pixels are kept.
      const clean = await stripMetadata(bytes, ext);
      if (!clean) throw new AppError('validation', 'This photo could not be read; try another one', 400);
      const key = `${newId(uploadPrefix(purpose))}.${ext}`;
      await storage.put(key, clean);
      // `upload` is the receipt to attach the photo with; `url` is for showing it right away.
      return c.json({ upload: uploadReceipt(c.get('user'), key), url: photoUrl(uploadPath(key)) }, 201);
    },
  )
  .get('/uploads/:key', async (c) => {
    const key = c.req.param('key');
    if (!isUploadKey(key)) throw notFound('File');
    let cache = 'public, max-age=31536000, immutable';
    if (isPrivateKey(key)) {
      const left = signedLinkSecondsLeft(key, c.req.query('exp'), c.req.query('sig'));
      if (left === null) throw notFound('File');
      cache = `private, max-age=${left}`;
    }
    const file = await storage.get(key);
    if (!file) throw notFound('File');
    return c.body(file.data, 200, {
      'Content-Type': file.contentType,
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    });
  });
