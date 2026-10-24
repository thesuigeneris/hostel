export type IdPrefix =
  | 'usr'
  | 'hst'
  | 'pho'
  | 'rmt'
  | 'vis'
  | 'fdp'
  | 'mnw'
  | 'mni'
  | 'sub'
  | 'inv'
  | 'skp'
  | 'mov'
  | 'pay'
  | 'ses'
  | 'otp'
  | 'sin'
  | 'res'
  | 'rnt'
  | 'rev'
  | 'iss'
  | 'isc'
  | 'pst'
  | 'pcm';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random, URL-safe id with a type prefix, e.g. `hst_k3j9x0q2m1a8b7c6`. */
export function newId(prefix: IdPrefix, length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}
