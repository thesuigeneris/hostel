const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;
const SENDER_ID = process.env.MSG91_SENDER_ID;

export function isMsg91Configured(): boolean {
  return !!(AUTH_KEY && TEMPLATE_ID && SENDER_ID);
}

export function generateOtp(): string {
  if (process.env.NODE_ENV === 'production' && isMsg91Configured()) {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  return '123456';
}

export async function sendOtp(phone: string, otp: string): Promise<void> {
  if (!isMsg91Configured()) {
    console.log(`[OTP-DEV] ${phone} -> ${otp}`);
    return;
  }
  const res = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: AUTH_KEY!,
    },
    body: JSON.stringify({
      template_id: TEMPLATE_ID,
      sender: SENDER_ID,
      mobile: phone.replace(/^\+/, ''),
      otp,
      otp_length: 6,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`msg91 send failed: ${res.status} ${text}`);
  }
}
