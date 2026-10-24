/**
 * File storage for uploaded photos. Local disk for now; an R2 implementation can satisfy the
 * same interface later (switched on by R2_* env vars).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiPublicUrl } from './env';

export type StoredFile = { bytes: Uint8Array; contentType: string };

export interface Storage {
  /** Saves the file and returns its public URL. `name` is a safe generated filename. */
  put(name: string, bytes: Uint8Array, contentType: string): Promise<string>;
  get(name: string): Promise<StoredFile | null>;
}

export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Detects the image type from the file signature, ignoring whatever the client claimed. */
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png';
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

const SAFE_NAME = /^[a-z0-9_-]+\.(jpg|png|webp)$/;

export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? fileURLToPath(new URL('../../uploads', import.meta.url));
}

export const localStorage: Storage = {
  async put(name, bytes) {
    if (!SAFE_NAME.test(name)) throw new Error(`unsafe upload name: ${name}`);
    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);
    return `${apiPublicUrl()}/uploads/${name}`;
  },
  async get(name) {
    // Only generated names are ever served, which rules out path traversal.
    if (!SAFE_NAME.test(name)) return null;
    try {
      const bytes = new Uint8Array(await readFile(path.join(uploadDir(), name)));
      const ext = name.split('.').pop()!;
      const contentType = (Object.entries(IMAGE_TYPES).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream') as string;
      return { bytes, contentType };
    } catch {
      return null;
    }
  },
};

export const storage: Storage = localStorage;
