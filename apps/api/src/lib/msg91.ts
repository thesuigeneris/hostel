import { randomOtp } from './crypto';
import { env } from './env';

export const DEV_OTP = '123456';

export function isMsg91Configured(): boolean {
  return !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
}

/** Stub mode (no MSG91 key) always uses the dev OTP so local logins are predictable. */
export function generateOtp(): string {
  return isMsg91Configured() ? randomOtp() : DEV_OTP;
}

export async function sendOtp(phone: string, otp: string): Promise<void> {
  if (!isMsg91Configured()) {
    if (!env.isProduction && process.env.NODE_ENV !== 'test') console.log(`[otp:stub] ${phone} -> ${otp}`);
    return;
  }
  const res = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: process.env.MSG91_AUTH_KEY! },
    body: JSON.stringify({
      template_id: process.env.MSG91_TEMPLATE_ID,
      mobile: `91${phone}`,
      otp,
      otp_length: 6,
    }),
  });
  if (!res.ok) throw new Error(`msg91 send failed: ${res.status} ${await res.text()}`);
}
