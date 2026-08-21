import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function auditLogRoutes(app: FastifyInstance) {

  // GET /audit-logs — paginated, filterable audit trail
  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    const {
      page     = 1,
      pageSize = 20,
      action   = '',
      entity   = '',
      userId   = '',
      from     = '',
      to       = '',
      search   = '',
    } = req.query as any

    const skip  = (Number(page) - 1) * Number(pageSize)
    const where: any = { tenantId: req.user.tid }

    if (action) where.action = action
    if (entity) where.entity = entity
    if (userId) where.userId = userId

    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to)   where.createdAt.lte = new Date(to + 'T23:59:59.999Z')
    }

    if (search) {
      where.OR = [
        { action:   { contains: search, mode: 'insensitive' } },
        { entity:   { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { ip:       { contains: search } },
      ]
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take:     Number(pageSize),
        orderBy:  { createdAt: 'desc' },
        include:  { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ])

    // Summary counts for filter chips
    const [actions, entities] = await Promise.all([
      prisma.auditLog.groupBy({ by: ['action'],  where: { tenantId: req.user.tid }, _count: true, orderBy: { _count: { action: 'desc' } } }),
      prisma.auditLog.groupBy({ by: ['entity'],  where: { tenantId: req.user.tid }, _count: true, orderBy: { _count: { entity: 'desc' } } }),
    ])

    return {
      success: true,
      data: {
        logs,
        total,
        page:       Number(page),
        totalPages: Math.ceil(total / Number(pageSize)),
        summary:    { actions, entities },
      },
    }
  })

  // GET /audit-logs/export — CSV download
  app.get('/export', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { from = '', to = '', action = '', entity = '' } = req.query as any
    const where: any = { tenantId: req.user.tid }
    if (action) where.action = action
    if (entity) where.entity = entity
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to)   where.createdAt.lte = new Date(to + 'T23:59:59.999Z')
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    5000,
      include: { user: { select: { name: true, email: true } } },
    })

    const header = 'Timestamp,Action,Entity,Entity ID,User,Email,IP'
    const rows   = logs.map(l => [
      new Date(l.createdAt).toISOString(),
      l.action,
      l.entity,
      l.entityId || '',
      l.user?.name || '',
      l.user?.email || '',
      l.ip || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))

    const csv = [header, ...rows].join('\n')

    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', `attachment; filename="audit-log-${Date.now()}.csv"`)
    return reply.send(csv)
  })
}
