import type { NextConfig } from 'next';

/** Insights micro frontend (analytics dashboard). Served under /insights via the shell. */
const config: NextConfig = {
  basePath: '/insights',
  devIndicators: false,
  transpilePackages: ['@poc/ui', '@poc/tracker', '@poc/mock-data', '@poc/warehouse'],
  serverExternalPackages: ['@duckdb/node-api'],
};

export default config;
