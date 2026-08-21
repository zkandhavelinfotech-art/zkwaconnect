import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db'

// Lazy Redis client — only connect if REDIS_URL is set
let redis: any = null
async function getRedis() {
  if (redis) return redis
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    const { Redis } = await import('ioredis')
    redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 })
    await redis.ping()
    return redis
  } catch { redis = null; return null }
}

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    const payload = req.user as any
    if (!payload?.uid || !payload?.tid) {
      return reply.status(401).send({ success: false, error: 'Invalid token payload' })
    }

    // Try Redis cache (60s TTL)
    const cacheKey = `user:${payload.uid}`
    const r = await getRedis()
    if (r) {
      try {
        const cached = await r.get(cacheKey)
        if (cached) {
          const user = JSON.parse(cached)
          if (!user.isActive) return reply.status(401).send({ success: false, error: 'Account inactive' })
          return  // cache hit — authenticated
        }
      } catch {}
    }

    // DB fallback
    const user = await prisma.user.findFirst({
      where: { id: payload.uid, tenantId: payload.tid, isActive: true },
      select: { id: true, tenantId: true, role: true, isActive: true },
    })
    if (!user) {
      return reply.status(401).send({ success: false, error: 'User not found or inactive' })
    }

    // Write to cache
    if (r) {
      try { await r.setex(cacheKey, 60, JSON.stringify(user)) } catch {}
    }

  } catch {
    return reply.status(401).send({ success: false, error: 'Unauthorized' })
  }
}
