import { describe, expect, test } from 'bun:test';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordProblem } from '../src/passwords';
import { registerSchema } from '../src/schemas';

describe('password policy', () => {
  test('length bounds are inclusive: 15 and 128 pass, 14 and 129 fail', () => {
    expect(passwordProblem('a'.repeat(3) + 'mango tree rain')).toBeNull(); // 18 chars, no pattern
    expect(passwordProblem('rain on the hil')).toBeNull(); // exactly 15
    expect(passwordProblem('rain on the hi')).toContain(`${PASSWORD_MIN_LENGTH}`);
    const longOk = 'sunny mango morning '.repeat(7).slice(0, PASSWORD_MAX_LENGTH);
    expect(longOk).toHaveLength(128);
    expect(passwordProblem(longOk)).toBeNull();
    expect(passwordProblem(`${longOk}x`)).toContain(`${PASSWORD_MAX_LENGTH}`);
  });

  test('no composition rules: spaces, unicode and lowercase-only passphrases are fine', () => {
    expect(passwordProblem('चाय और बिस्कुट सुबह में')).toBeNull();
    expect(passwordProblem('my cat likes warm idli')).toBeNull();
  });

  test('blocks common, repeated and sequential passwords, case and spaces ignored', () => {
    expect(passwordProblem('PasswordPassword')).toContain('too common');
    expect(passwordProblem('Pass word Pass word')).toContain('too common');
    expect(passwordProblem('abcabcabcabcabcabc')).toContain('repeating');
    expect(passwordProblem('aaaaaaaaaaaaaaaaaaa')).toContain('repeating');
    expect(passwordProblem('123456789012345')).toContain('sequences');
    expect(passwordProblem('abcdefghijklmnopq')).toContain('sequences');
    expect(passwordProblem('ponmlkjihgfedcba')).toContain('sequences');
    expect(passwordProblem(' '.repeat(20))).not.toBeNull();
  });

  test('rejects the account phone inside the password', () => {
    expect(passwordProblem('my number 9876543210 ok', '9876543210')).toContain('phone');
    expect(passwordProblem('my number 9876543210 ok', '9123456780')).toBeNull();
  });

  test('registerSchema reports the policy on the password field', () => {
    const bad = registerSchema.safeParse({ phone: '+91 98765 43210', password: 'short', name: 'Asha' });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0]!.path).toEqual(['password']);
    const ok = registerSchema.safeParse({ phone: '+91 98765 43210', password: 'a quiet room near the lake', name: 'Asha' });
    expect(ok.success).toBe(true);
    expect(ok.data!.phone).toBe('9876543210');
  });
});
