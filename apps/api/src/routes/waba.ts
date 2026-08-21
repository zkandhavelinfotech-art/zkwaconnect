import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { getPhoneNumberInfo, submitTemplate } from '../services/whatsapp'

export async function wabaRoutes(app: FastifyInstance) {

  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    const accounts = await prisma.wABAAccount.findMany({ where: { tenantId: req.user.tid }, orderBy: { createdAt: 'desc' } })
    return { success: true, data: accounts.map(a => ({ ...a, accessToken: undefined, appSecret: undefined })) }
  })

  app.post('/connect', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { phoneId, wabaId, accessToken, appSecret, nickname, apiVersion = 'v20.0' } = req.body as any
    if (!phoneId || !wabaId || !accessToken) return reply.status(400).send({ success: false, error: 'phoneId, wabaId, accessToken required' })

    // Verify credentials with Meta
    let phoneInfo: any = {}
    try {
      phoneInfo = await getPhoneNumberInfo(phoneId, accessToken, apiVersion)
    } catch {
      return reply.status(400).send({ success: false, error: 'Cannot verify credentials with Meta. Check phoneId and accessToken.' })
    }

    const existing = await prisma.wABAAccount.findFirst({ where: { tenantId: req.user.tid, phoneId } })
    if (existing) return reply.status(409).send({ success: false, error: 'This phone number is already connected' })

    const isFirst = !(await prisma.wABAAccount.findFirst({ where: { tenantId: req.user.tid } }))

    const account = await prisma.wABAAccount.create({
      data: { tenantId: req.user.tid, phoneId, wabaId, phoneNumber: phoneInfo.display_phone_number || phoneId, displayName: phoneInfo.verified_name, nickname, accessToken, appSecret, apiVersion, isActive: isFirst, qualityRating: phoneInfo.quality_rating, tierLimit: 1000 },
    })

    return reply.status(201).send({ success: true, data: { id: account.id, phoneNumber: account.phoneNumber, displayName: account.displayName, isActive: account.isActive } })
  })

  app.post('/:id/activate', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const account = await prisma.wABAAccount.findFirst({ where: { id, tenantId: req.user.tid } })
    if (!account) return reply.status(404).send({ success: false, error: 'Not found' })

    await prisma.wABAAccount.updateMany({ where: { tenantId: req.user.tid }, data: { isActive: false } })
    await prisma.wABAAccount.update({ where: { id }, data: { isActive: true } })
    return { success: true }
  })

  app.delete('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const account = await prisma.wABAAccount.findFirst({ where: { id, tenantId: req.user.tid } })
    if (!account) return reply.status(404).send({ success: false, error: 'Not found' })
    await prisma.wABAAccount.delete({ where: { id } })
    return { success: true }
  })
}
