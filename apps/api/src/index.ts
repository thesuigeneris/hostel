import { createApp } from './app';
import { assertProductionConfig } from './lib/config-check';
import { env } from './lib/env';
import { otpMode } from './lib/msg91';
import { instancePaymentMode } from './lib/razorpay';
import { startScheduler } from './services/jobs';

// Before anything listens or the scheduler runs: a production instance on public fallback secrets could have its
// private photo links and upload receipts forged.
assertProductionConfig();

const app = createApp();

console.log(`hostels-api listening on http://localhost:${env.port}`);
console.log(`  payments: ${instancePaymentMode()}${instancePaymentMode() === 'razorpay_live' ? ' (real money)' : ' (no real money moves)'}`);
const OTP_LOG = { live: 'live (real texts)', stub: 'stub (OTP is 123456)', off: 'off (phone + password login only)' } as const;
console.log(`  msg91:    ${OTP_LOG[otpMode()]}`);

if (process.env.JOBS !== 'off') startScheduler();

export default { port: env.port, fetch: app.fetch };
