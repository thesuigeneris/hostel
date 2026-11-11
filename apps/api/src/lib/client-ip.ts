import type { Context } from 'hono';
import { isIP } from 'node:net';
import { env } from './env';

type BunServerLike = { requestIP?: (req: Request) => { address: string } | null };

/** The address of whoever opened the connection to this process (Bun passes its server as the fetch `env`). */
function socketAddress(c: Context): string | null {
  const e = c.env as (BunServerLike & { server?: BunServerLike }) | undefined;
  const server = e?.server ?? e;
  try {
    return server?.requestIP?.(c.req.raw)?.address ?? null;
  } catch {
    return null;
  }
}

/**
 * The client's address, for rate limits and view counting.
 *
 * With `TRUST_PROXY=1` (production behind Caddy, and the website forwarding its visitors) it is the rightmost
 * `X-Forwarded-For` entry: the one our own proxy wrote. Entries further left come from the client and are ignored, so
 * a made-up header can't buy a fresh limit. Without it, the header is ignored entirely and the connection's address is
 * used, so on a directly exposed API nobody can claim to be someone else.
 */
export function clientIp(c: Context): string {
  if (env.trustProxy) {
    const forwarded = c.req.header('x-forwarded-for');
    const last = forwarded?.split(',').map((s) => s.trim()).filter(Boolean).pop();
    if (last && isIP(stripPort(last))) return normalizeIp(stripPort(last));
  }
  const socket = socketAddress(c);
  return socket ? normalizeIp(socket) : 'unknown';
}

function stripPort(value: string): string {
  // "203.0.113.5:443" or "[2001:db8::1]:443"
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) return bracketed[1]!;
  return /^\d+\.\d+\.\d+\.\d+:\d+$/.test(value) ? value.split(':')[0]! : value;
}

/**
 * One key per client: IPv4 as is (IPv4-mapped IPv6 unwrapped), IPv6 cut to its /64, since one home or phone gets a
 * whole /64 and could otherwise rotate through addresses to dodge a limit.
 */
export function normalizeIp(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1]!;
  if (isIP(address) !== 6) return address;
  const [head, tail = ''] = address.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const full = address.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}
