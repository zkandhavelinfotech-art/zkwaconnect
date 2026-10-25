import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Always baked in at build time ("off" unless set), so production builds drop the demo-login box and its credentials entirely.
  env: { NEXT_PUBLIC_DEMO_LOGIN: process.env.NEXT_PUBLIC_DEMO_LOGIN === 'on' ? 'on' : 'off' },
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
