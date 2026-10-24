/**
 * Password policy for single-factor login (no SMS needed). Follows OWASP Authentication Cheat Sheet / NIST SP800-63B:
 * at least 15 characters without MFA, allow at least 64, no composition rules, block common and trivial passwords.
 */
export const PASSWORD_MIN_LENGTH = 15;
/** Checked before hashing so very long inputs can't be used to exhaust the server. */
export const PASSWORD_MAX_LENGTH = 128;

/** Common passwords that are long enough to pass the length rule. Compared case-insensitively, ignoring spaces. */
const COMMON = new Set([
  'passwordpassword',
  'password1234567',
  'password12345678',
  'password123456789',
  'passwordpassword1',
  'iloveyouiloveyou',
  'qwertyuiopasdfghjkl',
  'qwertyuiopasdfgh',
  'qwertyuiop123456',
  '1qaz2wsx3edc4rfv',
  '1q2w3e4r5t6y7u8i',
  'zaq12wsxcde34rfv',
  'letmeinletmein',
  'welcomewelcome1',
  'administrator123',
  'administrator1234',
  'changemechangeme',
  'trustno1trustno1',
  'hostelhostelhostel',
  'hostelpassword123',
  'mypasswordis12345',
  'thisismypassword',
  'thisismypassword1',
  'correcthorsebatterystaple',
  'abcdefghijklmnopqrstuvwxyz',
  'indiaindiaindia',
  'iloveindia12345',
  'hyderabad123456',
  'hyderabad1234567',
]);

const SEQUENCES = ['0123456789012345678901234567890', 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm'];

/** Returns a reason the password is not allowed, or null when it is fine. `phone` is the 10-digit account phone. */
export function passwordProblem(password: string, phone?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters. A few words with spaces works well.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  const folded = password.toLowerCase().replace(/\s+/g, '');
  if (COMMON.has(folded)) return 'That password is too common. Pick something only you would know.';
  // One short chunk repeated ("abcabcabc…", "aaaa…") is easy to guess.
  if (/^(.{1,4})\1+$/.test(folded)) return 'Avoid repeating the same few characters.';
  for (const seq of SEQUENCES) {
    if (seq.includes(folded) || [...seq].reverse().join('').includes(folded)) return 'Avoid simple sequences like 1234… or abcd….';
  }
  if (phone && folded.includes(phone)) return 'Don’t use your phone number in your password.';
  return null;
}
