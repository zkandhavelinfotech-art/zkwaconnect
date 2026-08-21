import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { prisma } from './db'

import { authRoutes }          from './routes/auth'
import { webhookRoutes }       from './routes/webhook'
import { wabaRoutes }          from './routes/waba'
import { messageRoutes }       from './routes/messages'
import { billingRoutes }       from './routes/billing'
import { leadRoutes }          from './routes/leads'
import { contactRoutes }       from './routes/contacts'
import { templateRoutes }      from './routes/templates'
import { campaignRoutes }      from './routes/campaigns'
import { tenantRoutes }        from './routes/tenant'
import { analyticsRoutes }     from './routes/analytics'
import { sseRoutes }           from './routes/sse'
import { productRoutes }       from './routes/products'
import { webhookEventRoutes }  from './routes/webhookEvents'
import { smtpRoutes }          from './routes/smtpConfig'
import { apiKeyRoutes }        from './routes/apiKeys'
import { auditLogRoutes }      from './routes/auditLogs'
import { authMiddleware }      from './middleware/auth'
import { registerAuditHook }    from './middleware/audit'

export { prisma }

// Sentry error tracking (optional — only if SENTRY_DSN is set)
if (process.env.SENTRY_DSN) {
  import('@sentry/node').then(Sentry => {
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development', tracesSampleRate: 0.1 })
    console.log('[Sentry] Initialized')
  }).catch(() => { /* Sentry not installed — skip */ })
}

export const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  trustProxy: true,
})

async function buildApp() {
  // Raw body for Meta HMAC verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      ;(req as any).rawBody = body
      done(null, JSON.parse(body as string))
    } catch (e: any) { done(e) }
  })

  // CORS
  await app.register(cors, {
    origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(','),
    credentials: true,
  })

  // JWT
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production-32ch',
    sign: { expiresIn: '15m' },
  })

  // File uploads (10MB max)
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

  // Global rate limit (200/min) — auth routes override this per-route
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'],
  })

  // Auth decorator
  app.decorate('authenticate', authMiddleware)

  // Audit logging hook
  registerAuditHook(app)

  // Health check (no auth)
  app.get('/health', async () => ({
    status: 'ok',
    version: '3.3.0',
    timestamp: new Date().toISOString(),
  }))

  const API = '/api/v1'

  // Auth — strict rate limit applied inside the route file
  await app.register(authRoutes,         { prefix: `${API}/auth` })

  // Webhooks (no auth — HMAC verified inside)
  await app.register(webhookRoutes,      { prefix: '/webhook' })

  // Authenticated API routes
  await app.register(sseRoutes,          { prefix: `${API}/sse` })
  await app.register(wabaRoutes,         { prefix: `${API}/waba` })
  await app.register(messageRoutes,      { prefix: `${API}/messages` })
  await app.register(leadRoutes,         { prefix: `${API}/leads` })
  await app.register(contactRoutes,      { prefix: `${API}/contacts` })
  await app.register(templateRoutes,     { prefix: `${API}/templates` })
  await app.register(campaignRoutes,     { prefix: `${API}/campaigns` })
  await app.register(billingRoutes,      { prefix: `${API}/billing` })
  await app.register(tenantRoutes,       { prefix: `${API}/tenant` })
  await app.register(analyticsRoutes,    { prefix: `${API}/analytics` })
  await app.register(productRoutes,      { prefix: `${API}/products` })
  await app.register(webhookEventRoutes, { prefix: `${API}/webhook-events` })
  await app.register(smtpRoutes,         { prefix: `${API}/tenant/smtp` })
  await app.register(apiKeyRoutes,       { prefix: `${API}/api-keys` })
  await app.register(auditLogRoutes,     { prefix: `${API}/audit-logs` })

  // Global error handler
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error)
    reply.status(error.statusCode || 500).send({
      success: false,
      error: (error.statusCode || 500) === 500 ? 'Internal server error' : error.message,
    })
  })

  return app
}

async function start() {
  try {
    await buildApp()
    await prisma.$connect()
    app.log.info('Database connected')
    await app.listen({ port: parseInt(process.env.PORT || '4000'), host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    await prisma.$disconnect()
    process.exit(1)
  }
}

start()
