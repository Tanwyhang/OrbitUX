/** @type {import('next').NextConfig} */
const nextConfig = {
  // External packages for server-side API routes
  serverExternalPackages: [
    '@railgun-community/wallet',
    '@railgun-community/shared-models',
    'leveldown',
    'snarkjs',
    'circomlibjs',
    'ffjavascript',
  ],
  
  // Use Turbopack with empty config to suppress warning
  turbopack: {},
  
  // Experimental features
  experimental: {
    // Allow long-running API routes for ZK proof generation
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
