import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

// Methods that mutate data
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Routes to skip (read-only, auth, SSE)
const SKIP_PATTERNS = [
  /\/auth\/login/, /\/auth\/refresh/, /\/auth\/me/,
  /\/health/, /\/sse/, /\/webhook\/meta/,
]

export function registerAuditHook(app: FastifyInstance) {
  app.addHook('onResponse', async (req, reply) => {
    if (!MUTATING.has(req.method)) return
    if (SKIP_PATTERNS.some(p => p.test(req.url))) return
    if (reply.statusCode >= 400) return

    const user = (req as any).user as any
    if (!user?.tid) return

    // Extract entity from URL: /api/v1/{entity}/{id?}
    const parts  = req.url.replace(/\?.*/, '').split('/').filter(Boolean)
    const entity = parts[2] || 'unknown'
    const id     = parts[3] || undefined
    const action = ({ POST:'CREATE', PUT:'UPDATE', PATCH:'UPDATE', DELETE:'DELETE' })[req.method] || req.method

    await prisma.auditLog.create({
      data: {
        tenantId: user.tid,
        userId:   user.uid  || null,
        action,
        entity:   entity.toUpperCase(),
        entityId: id || null,
        ip:       req.ip,
        userAgent: req.headers['user-agent'] || null,
      },
    }).catch(() => {}) // never block response on audit failure
  })
}
