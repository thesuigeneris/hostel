import { randomDigits } from './crypto';

const cfg = () => ({
  authKey: process.env.MSG91_AUTH_KEY,
  templateId: process.env.MSG91_TEMPLATE_ID,
  senderId: process.env.MSG91_SENDER_ID,
});

export function isMsg91Configured(): boolean {
  const c = cfg();
  return !!(c.authKey && c.templateId && c.senderId);
}

/** In stub mode the OTP is always 123456 so local dev and tests are predictable. */
export function generateOtp(): string {
  return isMsg91Configured() ? randomDigits(6) : '123456';
}

export async function sendOtp(phone: string, otp: string): Promise<void> {
  if (!isMsg91Configured()) {
    if (process.env.NODE_ENV !== 'test') console.log(`[OTP-DEV] ${phone} -> ${otp}`);
    return;
  }
  const c = cfg();
  const res = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: c.authKey! },
    body: JSON.stringify({ template_id: c.templateId, sender: c.senderId, mobile: `91${phone}`, otp, otp_length: 6 }),
  });
  if (!res.ok) throw new Error(`msg91 send failed: ${res.status} ${await res.text()}`);
}
