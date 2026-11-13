/**
 * Makes an existing account an admin. Run on the server, where shell access is the proof of authority:
 *   bun run admin:grant 9876543210
 * Needed when SMS login is off, because ADMIN_PHONES only applies to phones verified by OTP.
 */
import { phoneSchema } from '@hostels/shared';
import { closeDb } from '../db';
import { grantAdmin } from '../services/auth';

const parsed = phoneSchema.safeParse(process.argv[2] ?? '');
if (!parsed.success) {
  console.error('usage: bun run admin:grant <10-digit phone>');
  process.exit(1);
}
try {
  const user = await grantAdmin(parsed.data);
  console.log(`${user.phone} (${user.name || 'no name'}) is now an admin`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
