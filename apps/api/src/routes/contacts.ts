import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function contactRoutes(app: FastifyInstance) {

  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    const { page = 1, pageSize = 20, search = '', label = '' } = req.query as any
    const skip  = (Number(page) - 1) * Number(pageSize)
    const where: any = { tenantId: req.user.tid }
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }, { email: { contains: search, mode: 'insensitive' } }]
    if (label)  where.labels = { has: label }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({ where, skip, take: Number(pageSize), orderBy: { createdAt: 'desc' } }),
      prisma.contact.count({ where }),
    ])
    return { success: true, data: { contacts, total, page: Number(page), totalPages: Math.ceil(total / Number(pageSize)) } }
  })

  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { phone, name, email, labels = [], notes, source = 'manual', optedIn = true } = req.body as any
    if (!phone) return reply.status(400).send({ success: false, error: 'phone required' })

    const existing = await prisma.contact.findFirst({ where: { tenantId: req.user.tid, phone } })
    if (existing) return reply.status(409).send({ success: false, error: 'Contact with this phone already exists' })

    const contact = await prisma.contact.create({ data: { tenantId: req.user.tid, phone, name, email, labels, notes, source, optedIn } })
    return reply.status(201).send({ success: true, data: contact })
  })

  app.patch('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const r = await prisma.contact.updateMany({ where: { id, tenantId: req.user.tid }, data: req.body as any })
    if (!r.count) return reply.status(404).send({ success: false, error: 'Not found' })
    return { success: true }
  })

  app.delete('/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as any
    await prisma.contact.deleteMany({ where: { id, tenantId: req.user.tid } })
    return { success: true }
  })
}
