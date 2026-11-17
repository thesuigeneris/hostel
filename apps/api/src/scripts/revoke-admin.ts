/**
 * Takes admin away from an account (the other half of `admin:grant`). Run on the server:
 *   bun run admin:revoke 9876543210
 * Live sessions lose admin at their next request. If the phone is also in ADMIN_PHONES, remove it there as well, or
 * its next OTP login makes it admin again.
 */
import { phoneSchema } from '@hostels/shared';
import { closeDb } from '../db';
import { revokeAdmin } from '../services/auth';

const parsed = phoneSchema.safeParse(process.argv[2] ?? '');
if (!parsed.success) {
  console.error('usage: bun run admin:revoke <10-digit phone>');
  process.exit(1);
}
try {
  const { user, wasAdmin, stillInAdminPhones } = await revokeAdmin(parsed.data);
  console.log(wasAdmin ? `${user.phone} (${user.name || 'no name'}) is no longer an admin; now ${user.role}` : `${user.phone} was not an admin`);
  if (stillInAdminPhones) {
    console.warn(`${user.phone} is still in ADMIN_PHONES: remove it there too, or its next OTP login makes it admin again`);
    process.exitCode = 2;
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
