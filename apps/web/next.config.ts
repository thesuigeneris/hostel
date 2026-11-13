import path from 'node:path';
import type { NextConfig } from 'next';

// The API's origin, for the images the Content Security Policy allows (lib/csp.ts). Read when the site is built and
// compiled into the middleware, so changing API_PUBLIC_URL needs a rebuild, as before.
const api = new URL(process.env.API_PUBLIC_URL ?? process.env.API_URL ?? 'http://localhost:4000').origin;

// The Docker image (deploy/web.Dockerfile) sets NEXT_OUTPUT=standalone: a self-contained server with only the files it
// traces. Tracing starts at the repository root so the shared workspace package is included. Local runs and the
// browser tests keep `next start`.
const standalone = process.env.NEXT_OUTPUT === 'standalone';

const config: NextConfig = {
  env: { CSP_API_ORIGIN: api },
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
          // The Content Security Policy is set per request by middleware.ts, with a fresh script nonce.
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
