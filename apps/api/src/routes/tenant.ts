import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import bcrypt from 'bcryptjs'

export async function tenantRoutes(app: FastifyInstance) {

  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tid } })
    return { success: true, data: tenant }
  })

  app.patch('/', { onRequest: [app.authenticate] }, async (req) => {
    const allowed = ['name', 'gstin', 'pan', 'address', 'city', 'state', 'pincode', 'country', 'logoUrl', 'website']
    const data: any = {}
    const body = req.body as any
    for (const k of allowed) if (body[k] !== undefined) data[k] = body[k]
    await prisma.tenant.update({ where: { id: req.user.tid }, data })
    return { success: true }
  })

  // Team users
  app.get('/users', { onRequest: [app.authenticate] }, async (req) => {
    const users = await prisma.user.findMany({
      where: { tenantId: req.user.tid },
      select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    return { success: true, data: users }
  })

  app.post('/users', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { email, name, role = 'AGENT', phone } = req.body as any
    if (!email || !name) return reply.status(400).send({ success: false, error: 'email and name required' })

    const existing = await prisma.user.findFirst({ where: { email, tenantId: req.user.tid } })
    if (existing) return reply.status(409).send({ success: false, error: 'User already exists' })

    const tempPassword   = Math.random().toString(36).slice(-10)
    const passwordHash   = await bcrypt.hash(tempPassword, 12)

    const user = await prisma.user.create({
      data: { tenantId: req.user.tid, email, name, role, phone, passwordHash, isActive: true },
    })

    return reply.status(201).send({ success: true, data: { id: user.id, email: user.email, name: user.name, role: user.role, tempPassword } })
  })

  app.patch('/users/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const body   = req.body as any
    const allowed = ['name', 'role', 'phone', 'isActive']
    const data: any = {}
    for (const k of allowed) if (body[k] !== undefined) data[k] = body[k]
    const r = await prisma.user.updateMany({ where: { id, tenantId: req.user.tid }, data })
    if (!r.count) return reply.status(404).send({ success: false, error: 'Not found' })
    return { success: true }
  })
}
