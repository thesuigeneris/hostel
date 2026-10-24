import { createApp } from './app';
import { env } from './lib/env';
import { isMsg91Configured } from './lib/msg91';
import { isRazorpayConfigured } from './lib/razorpay';

const app = createApp();

console.log(`hostels-api listening on http://localhost:${env.port}`);
console.log(`  razorpay: ${isRazorpayConfigured() ? 'live' : 'stub'}`);
console.log(`  msg91:    ${isMsg91Configured() ? 'live' : 'stub (OTP is 123456)'}`);

export default { port: env.port, fetch: app.fetch };
