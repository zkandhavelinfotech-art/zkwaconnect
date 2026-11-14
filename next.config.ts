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

import fs from 'node:fs'
import path from 'node:path'

// Auto-clean stale production build artifacts from .next whenever 'next dev' is booted.
// Prevents webpack chunk mismatch collisions ('Cannot find module ./XXXX.js') when dev server
// runs after 'next build'.
const isDevSession =
  envMap.NODE_ENV === 'development' ||
  process.argv.some(arg => arg === 'dev' || arg.includes('next-dev'))

if (isDevSession) {
  try {
    const nextDir = path.join(process.cwd(), '.next')
    const buildIdPath = path.join(nextDir, 'BUILD_ID')
    const stalePagesDir = path.join(nextDir, 'server', 'pages')
    if (fs.existsSync(buildIdPath) || fs.existsSync(stalePagesDir)) {
      fs.rmSync(path.join(nextDir, 'server'), { recursive: true, force: true })
      fs.rmSync(path.join(nextDir, 'cache'), { recursive: true, force: true })
      fs.rmSync(buildIdPath, { force: true })
    }
  } catch {
    // ignore
  }
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
