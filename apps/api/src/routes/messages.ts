import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { sendTextMessage } from '../services/whatsapp'
import { broadcastToTenant } from '../services/sse'

export async function messageRoutes(app: FastifyInstance) {

  app.get('/conversations', { onRequest: [app.authenticate] }, async (req) => {
    const { page = 1, pageSize = 20, search = '', status = '' } = req.query as any
    const skip = (Number(page) - 1) * Number(pageSize)

    const where: any = { tenantId: req.user.tid }
    if (status) where.status = status
    if (search) where.contact = { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where, skip, take: Number(pageSize),
        orderBy: { lastMessageAt: 'desc' },
        include: {
          contact: { select: { id: true, name: true, phone: true, email: true } },
          assignedTo: { select: { id: true, name: true } },
          messages: { orderBy: { timestamp: 'desc' }, take: 1 },
        },
      }),
      prisma.conversation.count({ where }),
    ])

    return { success: true, data: { conversations, total, page: Number(page), totalPages: Math.ceil(total / Number(pageSize)) } }
  })

  app.get('/:conversationId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { conversationId } = req.params as any
    const conv = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId: req.user.tid }, include: { contact: true } })
    if (!conv) return reply.status(404).send({ success: false, error: 'Not found' })

    const messages = await prisma.message.findMany({ where: { conversationId }, orderBy: { timestamp: 'asc' }, take: 100 })
    await prisma.conversation.update({ where: { id: conversationId }, data: { unreadCount: 0 } })
    return { success: true, data: messages }
  })

  app.post('/send', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { conversationId, content, type = 'TEXT' } = req.body as any
    if (!conversationId || !content) return reply.status(400).send({ success: false, error: 'conversationId and content required' })

    const conv = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId: req.user.tid }, include: { contact: true } })
    if (!conv) return reply.status(404).send({ success: false, error: 'Conversation not found' })

    const waba = await prisma.wABAAccount.findFirst({ where: { tenantId: req.user.tid, isActive: true } })
    if (!waba) return reply.status(400).send({ success: false, error: 'No active WABA account found' })

    // Enforce message limit
    const ten = await prisma.tenant.findUnique({ where: { id: req.user.tid }, select: { messagesSent: true, messagesLimit: true, planStatus: true } })
    if (ten && ten.planStatus !== 'TRIAL' && ten.messagesSent >= ten.messagesLimit) {
      return reply.status(429).send({ success: false, error: `Message limit reached (${ten.messagesLimit.toLocaleString()}/month). Upgrade your plan.` })
    }

    let waMessageId: string | undefined
    try {
      const res = await sendTextMessage(waba.phoneId, waba.accessToken, conv.contact.phone, content.text, waba.apiVersion)
      waMessageId = res?.messages?.[0]?.id
    } catch (e: any) {
      return reply.status(400).send({ success: false, error: `WhatsApp send failed: ${e.message}` })
    }

    const msg = await prisma.message.create({
      data: { conversationId, wabaAccountId: waba.id, waMessageId, direction: 'OUTBOUND', type, content, status: 'SENT', timestamp: new Date() },
    })

    await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
    await prisma.tenant.update({ where: { id: req.user.tid }, data: { messagesSent: { increment: 1 } } })

    broadcastToTenant(req.user.tid, 'MESSAGE_SENT', { conversationId, message: msg })

    return reply.status(201).send({ success: true, data: msg })
  })

  app.patch('/conversations/:id/assign', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const { agentId } = req.body as any
    await prisma.conversation.updateMany({ where: { id, tenantId: req.user.tid }, data: { assignedToId: agentId || null } })
    return { success: true }
  })

  app.patch('/conversations/:id/status', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const { status } = req.body as any
    if (!['OPEN','PENDING','RESOLVED','ARCHIVED'].includes(status)) return reply.status(400).send({ success: false, error: 'Invalid status' })
    await prisma.conversation.updateMany({ where: { id, tenantId: req.user.tid }, data: { status } })
    return { success: true }
  })
}
