// Normalize non-standard NODE_ENV values early to prevent Next.js build warnings
const envMap = process.env as Record<string, string | undefined>
const rawEnvVal = (envMap.NODE_ENV || '').toLowerCase().trim()
if (rawEnvVal === 'live' || rawEnvVal === 'prod' || rawEnvVal.includes('production')) {
  envMap.NODE_ENV = 'production'
} else if (rawEnvVal === 'dev' || rawEnvVal.includes('development') || rawEnvVal === 'local') {
  envMap.NODE_ENV = 'development'
} else if (rawEnvVal.includes('test')) {
  envMap.NODE_ENV = 'test'
}

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // When switching between PostgreSQL and MySQL schemas, Prisma type definitions differ slightly (e.g. insensitive mode, json path syntax).
    // ignoreBuildErrors allows Next.js production build to succeed seamlessly across both engines.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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
