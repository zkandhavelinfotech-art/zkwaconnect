import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function analyticsRoutes(app: FastifyInstance) {

  app.get('/overview', { onRequest: [app.authenticate] }, async (req) => {
    const { range = '7d' } = req.query as any
    const tid  = req.user.tid
    const days = range === '90d' ? 90 : range === '30d' ? 30 : 7
    const from = new Date(Date.now() - days * 86400000)

    const [messagesSent, messagesReceived, newLeads, activeConversations] = await Promise.all([
      prisma.message.count({ where: { conversation: { tenantId: tid }, direction: 'OUTBOUND', timestamp: { gte: from } } }),
      prisma.message.count({ where: { conversation: { tenantId: tid }, direction: 'INBOUND', timestamp: { gte: from } } }),
      prisma.lead.count({ where: { tenantId: tid, createdAt: { gte: from } } }),
      prisma.conversation.count({ where: { tenantId: tid, status: 'OPEN' } }),
    ])

    // Daily trend
    const trend = []
    for (let i = days - 1; i >= 0; i--) {
      const day   = new Date(Date.now() - i * 86400000)
      const start = new Date(day); start.setHours(0, 0, 0, 0)
      const end   = new Date(day); end.setHours(23, 59, 59, 999)
      const [sent, received] = await Promise.all([
        prisma.message.count({ where: { conversation: { tenantId: tid }, direction: 'OUTBOUND', timestamp: { gte: start, lte: end } } }),
        prisma.message.count({ where: { conversation: { tenantId: tid }, direction: 'INBOUND',  timestamp: { gte: start, lte: end } } }),
      ])
      trend.push({ date: start.toISOString().slice(0, 10), sent, received })
    }

    return { success: true, data: { messagesSent, messagesReceived, newLeads, activeConversations, trend } }
  })

  app.get('/campaigns', { onRequest: [app.authenticate] }, async (req) => {
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId: req.user.tid, status: { in: ['COMPLETED', 'RUNNING'] } },
      orderBy: { createdAt: 'desc' }, take: 10,
      select: { id: true, name: true, status: true, sentCount: true, deliveredCount: true, readCount: true, failedCount: true, replyCount: true, completedAt: true },
    })
    return { success: true, data: campaigns }
  })
}
