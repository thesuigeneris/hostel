import path from 'node:path';
import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
const api = new URL(process.env.API_PUBLIC_URL ?? process.env.API_URL ?? 'http://localhost:4000').origin;

// Images: every photo is an upload served from the API's origin (outside photo links are refused by the API), map
// tiles come from OpenStreetMap, and Razorpay Checkout may show its own images. Nothing else, so an outside image
// that slipped into older data can't load or track who views it. Food partner logos are links but never shown.
// Razorpay Checkout loads a script and opens its own frame. Next.js needs inline scripts, and eval in dev.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${api} https://*.tile.openstreetmap.org https://*.razorpay.com`,
  "font-src 'self' data:",
  "connect-src 'self' https://*.razorpay.com https://lumberjack.razorpay.com",
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

// The Docker image (deploy/web.Dockerfile) sets NEXT_OUTPUT=standalone: a self-contained server with only the files it
// traces. Tracing starts at the repository root so the shared workspace package is included. Local runs and the
// browser tests keep `next start`.
const standalone = process.env.NEXT_OUTPUT === 'standalone';

const config: NextConfig = {
  ...(standalone ? { output: 'standalone' as const, outputFileTracingRoot: path.resolve(process.cwd(), '../..') } : {}),
  transpilePackages: ['@hostels/shared'],
  poweredByHeader: false,
  // Photo uploads pass through server actions on their way to the API.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default config;
