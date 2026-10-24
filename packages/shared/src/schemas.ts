import { z } from 'zod';

/** Indian mobile number: 10 digits starting 6–9. Accepts an optional +91 / 91 / 0 prefix and spaces. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'));

export const otpSchema = z.string().trim().regex(/^\d{6}$/, 'OTP is 6 digits');

export const requestOtpSchema = z.object({ phone: phoneSchema });
export type RequestOtpInput = z.input<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
  /** Only used when the phone signs up for the first time. Admin is never self-assigned. */
  role: z.enum(['tenant', 'owner']).optional(),
  name: z.string().trim().max(80).optional(),
});
export type VerifyOtpInput = z.input<typeof verifyOtpSchema>;

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200).nullable(),
  })
  .partial();
export type UpdateMeInput = z.input<typeof updateMeSchema>;
