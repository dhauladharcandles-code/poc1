import type { NextConfig } from 'next';

/** Orders micro frontend. Served under /orders (the shell rewrites /orders/* here). */
const config: NextConfig = {
  devIndicators: false,
  basePath: '/orders',
  transpilePackages: ['@poc/ui', '@poc/tracker', '@poc/mock-data'],
};

export default config;
