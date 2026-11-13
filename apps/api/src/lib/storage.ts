import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env';

export interface Storage {
  put(key: string, data: Uint8Array, contentType: string): Promise<string>;
  get(key: string): Promise<{ data: Uint8Array<ArrayBuffer>; contentType: string } | null>;
}

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Stores files on local disk and serves them from /uploads/*. An R2 implementation can replace it later. */
export class LocalStorage implements Storage {
  constructor(private dir = process.env.UPLOAD_DIR ?? fileURLToPath(new URL('../../uploads', import.meta.url))) {}

  async put(key: string, data: Uint8Array): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, key), data);
    return `${env.publicUrl}/uploads/${key}`;
  }

  async get(key: string) {
    if (!/^[a-z0-9_]+\.(jpg|png|webp)$/.test(key)) return null;
    try {
      const data = await readFile(path.join(this.dir, key));
      return { data: new Uint8Array(data), contentType: TYPES[key.split('.').pop()!]! };
    } catch {
      return null;
    }
  }
}

export const storage: Storage = new LocalStorage();

/** Detects the image type from its first bytes, ignoring the declared type and file name. */
export function sniffImage(bytes: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}
