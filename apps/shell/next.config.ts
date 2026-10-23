import type { NextConfig } from 'next';

const ORDERS = process.env.ORDERS_ZONE_URL ?? 'http://localhost:3001';
const INSIGHTS = process.env.INSIGHTS_ZONE_URL ?? 'http://localhost:3002';

/**
 * The shell is the entry zone. It owns `/` (order queue) and the collector API, and
 * routes the other micro frontends (Next.js multi-zones) by path:
 *   /orders/*   → orders zone (order detail)
 *   /insights/* → insights zone (analytics dashboard)
 */
const config: NextConfig = {
  devIndicators: false,
  transpilePackages: ['@poc/ui', '@poc/tracker', '@poc/mock-data'],
  serverExternalPackages: ['@duckdb/node-api'],
  async rewrites() {
    return [
      { source: '/orders', destination: `${ORDERS}/orders` },
      { source: '/orders/:path*', destination: `${ORDERS}/orders/:path*` },
      { source: '/insights', destination: `${INSIGHTS}/insights` },
      { source: '/insights/:path*', destination: `${INSIGHTS}/insights/:path*` },
    ];
  },
};

export default config;
