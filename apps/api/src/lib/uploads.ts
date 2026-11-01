import { clock } from './clock';
import { hmacHex, safeEqual } from './crypto';
import { env } from './env';
import { AppError } from './errors';

/**
 * Uploaded photos are stored in the database as `/uploads/<key>` and turned into links when a response is built,
 * so a new domain or LAN address needs only `API_PUBLIC_URL`, not a data migration.
 *
 * The key's prefix records who may see the file, decided at upload time:
 * - `pho_` listing photos are public and cached for a year.
 * - `att_` issue and community attachments are private. Their links carry an expiry and a signature, and are only
 *   built inside responses that already passed the hostel membership check (`requireMember`): residents, the owner
 *   and admins. `GET /uploads/att_…` without a valid signature is a 404. A signed link works for anyone who holds it
 *   until it expires (60–90 minutes), which is what lets `<img>` on the website and `<Image>` in the app load it
 *   without a session.
 */
export type UploadPurpose = 'listing' | 'attachment';

const UPLOAD_PATH = /^\/uploads\/((?:pho|att)_[a-z0-9]{16}\.(?:jpg|png|webp))$/;
const UPLOAD_KEY = /^(?:pho|att)_[a-z0-9]{16}\.(?:jpg|png|webp)$/;

export const isUploadKey = (key: string) => UPLOAD_KEY.test(key);
export const isPrivateKey = (key: string) => key.startsWith('att_');
export const uploadPath = (key: string) => `/uploads/${key}`;

/**
 * The upload a photo link points at, if it is one of ours: the stored `/uploads/<key>`, or an absolute link to it.
 * Absolute links match on any host, because rows written before links were stored relative carry the old host.
 */
export function uploadKeyOf(link: string): string | null {
  let path = link;
  if (/^https?:\/\//i.test(link)) {
    try {
      path = new URL(link).pathname;
    } catch {
      return null;
    }
  }
  return UPLOAD_PATH.exec(path)?.[1] ?? null;
}

const invalidPhoto = (path: string, message: string) => new AppError('validation', message, 400, [{ path, message }]);

/** What to store for a listing photo: our upload as a relative path, any other web link as given. */
export function listingPhotoRef(link: string): string {
  const key = uploadKeyOf(link);
  if (!key) return link;
  if (isPrivateKey(key)) throw invalidPhoto('url', 'This photo was uploaded as a private attachment; upload it again as a listing photo');
  return uploadPath(key);
}

/** What to store for an issue or post photo: only a private attachment uploaded through `/uploads`. */
export function attachmentRef(link: string | null | undefined): string | null {
  if (!link) return null;
  const key = uploadKeyOf(link);
  if (!key || !isPrivateKey(key)) throw invalidPhoto('photoUrl', 'Attach a photo uploaded with this form');
  return uploadPath(key);
}

// --- links ------------------------------------------------------------------

const WINDOW_SECONDS = 30 * 60;
/** Lifetimes are rounded to 30-minute windows so a page reload within a window reuses the browser's cached copy. */
const MIN_WINDOWS = 2;

const signingKey = () => hmacHex(env.otpPepper, 'hostels:upload-links');
const signature = (key: string, exp: number) => hmacHex(signingKey(), `${key}|${exp}`).slice(0, 32);

/** The link a client uses for a stored photo, built now. Links that aren't our uploads pass through unchanged. */
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
  return `${url}?exp=${exp}&sig=${signature(key, exp)}`;
}

/** Seconds a private link has left, or null when it is missing, forged or expired. */
export function signedLinkSecondsLeft(key: string, exp: string | undefined, sig: string | undefined): number | null {
  if (!exp || !sig || !/^\d{1,12}$/.test(exp)) return null;
  const left = Number(exp) - Math.floor(clock.now().getTime() / 1000);
  if (left <= 0 || !safeEqual(signature(key, Number(exp)), sig)) return null;
  return left;
}
