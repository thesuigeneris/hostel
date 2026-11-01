import type { User } from '@hostels/shared';
import { clock } from './clock';
import { hmacHex, safeEqual } from './crypto';
import { env } from './env';
import { AppError } from './errors';

/**
 * Photos on listings, issues and community posts are always files uploaded through `POST /uploads`, never outside
 * links: those would skip the type, size and metadata checks, and an outside image in a private issue tells its host
 * who opened it.
 *
 * - Upload: the key's prefix records who may see the file. `pho_` listing photos are public and cached for a year;
 *   `att_` issue and community attachments are private. The response carries a receipt, `<key>.<signature>`, bound
 *   to the uploader. Attaching a photo takes the receipt, so nobody can attach a file they didn't upload, or a
 *   file uploaded for the other purpose.
 * - Storage: the database holds `/uploads/<key>`. Links are built when a response is made, so a new domain or LAN
 *   address needs only `API_PUBLIC_URL`, not a data migration.
 * - Private links carry an expiry and a signature, and are only built inside responses that already passed the
 *   hostel membership check (`requireMember`): residents, the owner and admins. `GET /uploads/att_…` without a valid
 *   signature is a 404. A signed link works for anyone holding it until it expires (60–90 minutes), which lets
 *   `<img>` on the website and `<Image>` in the app load it without a session.
 */
export type UploadPurpose = 'listing' | 'attachment';

const PREFIX: Record<UploadPurpose, 'pho' | 'att'> = { listing: 'pho', attachment: 'att' };
const UPLOAD_PATH = /^\/uploads\/((?:pho|att)_[a-z0-9]{16}\.(?:jpg|png|webp))$/;
const UPLOAD_KEY = /^(?:pho|att)_[a-z0-9]{16}\.(?:jpg|png|webp)$/;

export const uploadPrefix = (purpose: UploadPurpose) => PREFIX[purpose];
export const isUploadKey = (key: string) => UPLOAD_KEY.test(key);
export const isPrivateKey = (key: string) => key.startsWith('att_');
export const uploadPath = (key: string) => `/uploads/${key}`;

/**
 * The upload a stored photo points at: `/uploads/<key>`, or an absolute link to it. Absolute links match on any host,
 * because rows written before photos were stored relative carry the host of the time.
 */
export function uploadKeyOf(stored: string): string | null {
  let path = stored;
  if (/^https?:\/\//i.test(stored)) {
    try {
      path = new URL(stored).pathname;
    } catch {
      return null;
    }
  }
  return UPLOAD_PATH.exec(path)?.[1] ?? null;
}

// --- receipts -----------------------------------------------------------------

const receiptKey = () => hmacHex(env.otpPepper, 'hostels:upload-receipts');
const receiptSignature = (userId: string, key: string) => hmacHex(receiptKey(), `${userId}|${key}`).slice(0, 32);

/** What `POST /uploads` hands back to the uploader, to attach the photo with. */
export function uploadReceipt(user: User, key: string): string {
  return `${key}.${receiptSignature(user.id, key)}`;
}

/**
 * Checks a receipt sent to attach a photo: it must come from this user's own upload, made for this purpose.
 * Returns what to store.
 */
export function claimUpload(user: User, receipt: string, purpose: UploadPurpose, field: string): string {
  const fail = (message: string) => new AppError('validation', message, 400, [{ path: field, message }]);
  const dot = receipt.lastIndexOf('.');
  const key = receipt.slice(0, dot);
  if (dot < 0 || !isUploadKey(key) || !safeEqual(receiptSignature(user.id, key), receipt.slice(dot + 1))) {
    throw fail('Upload the photo again, then attach it');
  }
  if (!key.startsWith(`${PREFIX[purpose]}_`)) {
    throw fail(
      purpose === 'listing'
        ? 'This photo was uploaded as a private attachment; upload it again as a listing photo'
        : 'This photo was uploaded as a public listing photo; upload it again with this form',
    );
  }
  return uploadPath(key);
}

// --- links ------------------------------------------------------------------

const WINDOW_SECONDS = 30 * 60;
/** Lifetimes are rounded to 30-minute windows so a page reload within a window reuses the browser's cached copy. */
const MIN_WINDOWS = 2;

const linkKey = () => hmacHex(env.otpPepper, 'hostels:upload-links');
const linkSignature = (key: string, exp: number) => hmacHex(linkKey(), `${key}|${exp}`).slice(0, 32);

/**
 * The link a client uses for a stored photo, built now. Older rows may hold an outside link; it passes through,
 * and the website's Content Security Policy keeps it from loading.
 */
export function photoUrl(stored: string): string;
export function photoUrl(stored: string | null): string | null;
export function photoUrl(stored: string | null): string | null {
  if (!stored) return null;
  const key = uploadKeyOf(stored);
  if (!key) return stored;
  const url = `${env.publicUrl}${uploadPath(key)}`;
  if (!isPrivateKey(key)) return url;
  const now = Math.floor(clock.now().getTime() / 1000);
  const exp = (Math.floor(now / WINDOW_SECONDS) + MIN_WINDOWS + 1) * WINDOW_SECONDS;
  return `${url}?exp=${exp}&sig=${linkSignature(key, exp)}`;
}

/** Seconds a private link has left, or null when it is missing, forged or expired. */
export function signedLinkSecondsLeft(key: string, exp: string | undefined, sig: string | undefined): number | null {
  if (!exp || !sig || !/^\d{1,12}$/.test(exp)) return null;
  const left = Number(exp) - Math.floor(clock.now().getTime() / 1000);
  if (left <= 0 || !safeEqual(linkSignature(key, Number(exp)), sig)) return null;
  return left;
}
