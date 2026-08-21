import { FastifyInstance } from 'fastify'
import { registerSSEClient } from '../services/sse'

export async function sseRoutes(app: FastifyInstance) {
  // Accepts token via Authorization header OR ?token= query param
  // (EventSource cannot send headers, so query param is required for browser SSE)
  app.get('/', async (req, reply) => {
    // Resolve token from query param or header
    const query = req.query as any
    const header = req.headers.authorization?.replace('Bearer ', '')
    const token  = query.token || header

    if (!token) {
      return reply.status(401).send({ success: false, error: 'Token required' })
    }

    // Verify JWT manually (cannot use app.authenticate since we need hijack)
    let payload: any
    try {
      payload = app.jwt.verify(token)
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid token' })
    }

    const tenantId = payload?.tid
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: 'Invalid token payload' })
    }

    // SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.write(':connected\n\n')

    registerSSEClient(tenantId, reply)

    // Heartbeat every 25s
    const hb = setInterval(() => {
      try { reply.raw.write(':ping\n\n') } catch { clearInterval(hb) }
    }, 25000)

    req.raw.on('close', () => clearInterval(hb))
    reply.hijack()
  })
}
