import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No 'standalone' — works on GoDaddy, Railway, Vercel standard Node
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'app.zkwaconnect.in',
        'zkwaconnect.in',
      ],
    },
  },
}

export default nextConfig
