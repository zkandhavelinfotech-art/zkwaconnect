import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { submitTemplate } from '../services/whatsapp'

export async function templateRoutes(app: FastifyInstance) {

  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    const { status = '' } = req.query as any
    const where: any = { tenantId: req.user.tid }
    if (status) where.status = status
    const templates = await prisma.template.findMany({ where, orderBy: { createdAt: 'desc' } })
    return { success: true, data: templates }
  })

  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { name, category, language = 'en', components, bodyText, footerText, buttons } = req.body as any
    if (!name || !category || !components) return reply.status(400).send({ success: false, error: 'name, category, components required' })

    const template = await prisma.template.create({
      data: { tenantId: req.user.tid, name, category, language, status: 'PENDING', components, bodyText, footerText, buttons },
    })
    return reply.status(201).send({ success: true, data: template })
  })

  app.post('/:id/submit', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const template = await prisma.template.findFirst({ where: { id, tenantId: req.user.tid } })
    if (!template) return reply.status(404).send({ success: false, error: 'Not found' })

    const waba = await prisma.wABAAccount.findFirst({ where: { tenantId: req.user.tid, isActive: true } })
    if (!waba) return reply.status(400).send({ success: false, error: 'No active WABA account' })

    try {
      const result = await submitTemplate(waba.wabaId, waba.accessToken, template.name, template.category, template.language, template.components as any[], waba.apiVersion)
      await prisma.template.update({ where: { id }, data: { metaId: result.id, status: 'PENDING' } })
      return { success: true, data: { metaId: result.id, status: 'PENDING' } }
    } catch (e: any) {
      return reply.status(400).send({ success: false, error: `Meta submission failed: ${e.message}` })
    }
  })

  app.delete('/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as any
    await prisma.template.deleteMany({ where: { id, tenantId: req.user.tid, status: { not: 'APPROVED' } } })
    return { success: true }
  })
}
