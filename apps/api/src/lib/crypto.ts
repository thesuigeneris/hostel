import crypto from 'node:crypto';

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hmacHex(secret: string, value: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

/** Constant-time string comparison with the length check first. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function randomOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
