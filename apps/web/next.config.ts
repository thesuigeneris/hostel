import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@hostels/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};

export default config;
