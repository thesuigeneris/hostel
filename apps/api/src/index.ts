import { createApp } from './app';
import { runMigrations } from './db/migrate';
import { isMsg91Configured } from './lib/msg91';
import { isRazorpayConfigured } from './lib/razorpay';
import { startScheduler } from './services/jobs';
import './services/register-jobs';

await runMigrations();
const app = createApp();
const port = Number(process.env.PORT || 4000);

if (process.env.DISABLE_JOBS !== '1') startScheduler();

console.log(`hostels-api listening on http://localhost:${port}`);
console.log(`  razorpay: ${isRazorpayConfigured() ? 'live' : 'stub'}`);
console.log(`  msg91:    ${isMsg91Configured() ? 'live' : 'stub (OTP 123456)'}`);

export default { port, fetch: app.fetch };
