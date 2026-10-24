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
  | 'res'
  | 'rev'
  | 'flg'
  | 'iss'
  | 'isu'
  | 'pst'
  | 'cmt'
  | 'rpt'
  | 'opl'
  | 'oin'
  | 'rnt'
  | 'pap'
  | 'aud';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random id with a type prefix, e.g. `hst_3k9x0q2m7v1c8b4n`. 16 chars ≈ 82 bits. */
export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}
