import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
const api = process.env.API_PUBLIC_URL ?? process.env.API_URL ?? 'http://localhost:4000';

// Uploaded photos come from the API's origin; listing photos and map tiles from any https host.
// Razorpay Checkout loads a script and opens its own frame. Next.js needs inline scripts, and eval in dev.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${api}`,
  "font-src 'self' data:",
  "connect-src 'self' https://*.razorpay.com https://lumberjack.razorpay.com",
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const config: NextConfig = {
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
