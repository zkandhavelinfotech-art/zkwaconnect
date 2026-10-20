import { headers } from "next/headers"
import { prisma } from "@/lib/db/prisma"

// Brute-force protection for sign-in, password reset and 2FA. Failures are counted per key in the database
// (so it works across server instances); too many within the window locks the key for a while.

export class ThrottleError extends Error {
  readonly status = 429
  constructor(readonly retryAfterSeconds: number) {
    super(`Too many attempts. Try again in ${retryAfterSeconds >= 120 ? `${Math.ceil(retryAfterSeconds / 60)} minutes` : `${retryAfterSeconds} seconds`}.`)
    this.name = "ThrottleError"
  }
}

export type Limit = { key: string; max: number; windowMinutes: number; lockMinutes: number }

export const LIMITS = {
  loginAccount: (email: string): Limit => ({ key: `login:${email.toLowerCase()}`, max: 5, windowMinutes: 15, lockMinutes: 15 }),
  loginIp: (ip: string): Limit => ({ key: `login-ip:${ip}`, max: 30, windowMinutes: 15, lockMinutes: 30 }),
  resetAccount: (email: string): Limit => ({ key: `reset:${email.toLowerCase()}`, max: 3, windowMinutes: 60, lockMinutes: 60 }),
  resetIp: (ip: string): Limit => ({ key: `reset-ip:${ip}`, max: 10, windowMinutes: 60, lockMinutes: 60 }),
  twoFactor: (userId: string): Limit => ({ key: `2fa:${userId}`, max: 5, windowMinutes: 15, lockMinutes: 15 }),
}

export async function clientIp() {
  const list = await headers()
  return (list.get("x-forwarded-for")?.split(",")[0] || list.get("x-real-ip") || "unknown").trim().slice(0, 64)
}

// Throws while any of the keys is locked.
export async function assertNotLocked(...limits: Limit[]) {
  const rows = await prisma.authThrottle.findMany({ where: { key: { in: limits.map(limit => limit.key) }, lockedUntil: { gt: new Date() } } })
  if (rows.length) throw new ThrottleError(Math.ceil((Math.max(...rows.map(row => row.lockedUntil!.getTime())) - Date.now()) / 1000))
}

// Counts one failure (or one request, for rate limits); locks the key once it reaches the limit within the window.
export async function recordFailure(...limits: Limit[]) {
  for (const limit of limits) {
    await prisma.$executeRaw`
      INSERT INTO auth_throttles (key, failures, "windowStart", "lockedUntil") VALUES (${limit.key}, 1, now(), CASE WHEN ${limit.max} <= 1 THEN now() + make_interval(mins => ${limit.lockMinutes}) END)
      ON CONFLICT (key) DO UPDATE SET
        failures = CASE WHEN auth_throttles."windowStart" < now() - make_interval(mins => ${limit.windowMinutes}) THEN 1 ELSE auth_throttles.failures + 1 END,
        "windowStart" = CASE WHEN auth_throttles."windowStart" < now() - make_interval(mins => ${limit.windowMinutes}) THEN now() ELSE auth_throttles."windowStart" END,
        "lockedUntil" = CASE WHEN (CASE WHEN auth_throttles."windowStart" < now() - make_interval(mins => ${limit.windowMinutes}) THEN 1 ELSE auth_throttles.failures + 1 END) >= ${limit.max}
          THEN now() + make_interval(mins => ${limit.lockMinutes}) ELSE auth_throttles."lockedUntil" END`
  }
}

export async function clearThrottle(...limits: Limit[]) {
  await prisma.authThrottle.deleteMany({ where: { key: { in: limits.map(limit => limit.key) } } })
}
