import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function leadRoutes(app: FastifyInstance) {

  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    const { page = 1, pageSize = 20, stage = '', category = '', search = '' } = req.query as any
    const skip  = (Number(page) - 1) * Number(pageSize)
    const where: any = { tenantId: req.user.tid }
    if (stage)    where.stage    = stage
    if (category) where.category = category
    if (search)   where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }]

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({ where, skip, take: Number(pageSize), orderBy: { createdAt: 'desc' } }),
      prisma.lead.count({ where }),
    ])
    return { success: true, data: { leads, total, page: Number(page), totalPages: Math.ceil(total / Number(pageSize)) } }
  })

  app.get('/stats/overview', { onRequest: [app.authenticate] }, async (req) => {
    const tid   = req.user.tid
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const week  = new Date(Date.now() - 7 * 86400000)

    const [total, today_, week_, byStage, byCategory] = await Promise.all([
      prisma.lead.count({ where: { tenantId: tid } }),
      prisma.lead.count({ where: { tenantId: tid, createdAt: { gte: today } } }),
      prisma.lead.count({ where: { tenantId: tid, createdAt: { gte: week } } }),
      prisma.lead.groupBy({ by: ['stage'],    where: { tenantId: tid }, _count: true }),
      prisma.lead.groupBy({ by: ['category'], where: { tenantId: tid }, _count: true }),
    ])
    return { success: true, data: { total, today: today_, week: week_, byStage, byCategory } }
  })

  app.patch('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const fields = req.body as any
    const allowed = ['stage', 'priority', 'agentId', 'notes', 'value', 'closedAt']
    const data: any = {}
    for (const k of allowed) if (fields[k] !== undefined) data[k] = fields[k]
    if (data.stage && ['WON', 'LOST'].includes(data.stage)) data.closedAt = new Date()
    const r = await prisma.lead.updateMany({ where: { id, tenantId: req.user.tid }, data })
    if (!r.count) return reply.status(404).send({ success: false, error: 'Not found' })
    return { success: true }
  })

  app.delete('/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as any
    await prisma.lead.deleteMany({ where: { id, tenantId: req.user.tid } })
    return { success: true }
  })
}
