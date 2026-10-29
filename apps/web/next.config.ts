import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@job-copilot/db',
    '@job-copilot/agents',
    '@job-copilot/jobs',
    '@job-copilot/pdf-engine',
  ],
  serverExternalPackages: [
    '@myriaddreamin/typst-ts-node-compiler',
    'pdf-parse',
    'mammoth',
  ],
};

export default nextConfig;
