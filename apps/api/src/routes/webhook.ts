import { FastifyInstance } from 'fastify'
import { createHmac } from 'crypto'
import { prisma } from '../db'
import { classifyLead } from '../services/leadClassifier'
import { broadcastToTenant } from '../services/sse'
import { sendLeadAlert } from '../services/twilio'
import { sendTextMessage } from '../services/whatsapp'

const AUTO_REPLY = 'Thank you for reaching out! We received your message and will get back to you shortly. 🙏'

export async function webhookRoutes(app: FastifyInstance) {

  // Meta webhook verification
  app.get('/meta', async (req, reply) => {
    const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query as any
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return reply.status(200).send(challenge)
    }
    return reply.status(403).send('Forbidden')
  })

  // Inbound messages
  app.post('/meta', async (req, reply) => {
    // HMAC verification
    const rawBody  = (req as any).rawBody
    const sig      = req.headers['x-hub-signature-256'] as string
    if (sig) {
      const waba = await prisma.wABAAccount.findFirst({ where: { appSecret: { not: null } } })
      if (waba?.appSecret) {
        const expected = 'sha256=' + createHmac('sha256', waba.appSecret).update(rawBody).digest('hex')
        if (sig !== expected) return reply.status(401).send('Invalid signature')
      }
    }

    const body = req.body as any
    if (body.object !== 'whatsapp_business_account') return reply.status(200).send('OK')

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue
        const value = change.value

        for (const msg of value.messages || []) {
          await processMessage(value, msg)
        }
        for (const status of value.statuses || []) {
          await processStatus(status)
        }
      }
    }

    return reply.status(200).send('OK')
  })
}

async function processMessage(value: any, msg: any) {
  const phoneNumberId = value.metadata?.phone_number_id
  const from          = msg.from
  const text          = msg.text?.body || msg.caption || ''
  const msgType       = msg.type?.toUpperCase() || 'TEXT'

  // Find tenant by phone number ID
  const waba = await prisma.wABAAccount.findFirst({ where: { phoneId: phoneNumberId, isActive: true } })
  if (!waba) return

  const tenantId = waba.tenantId

  // Store webhook event
  await prisma.webhookEvent.create({
    data: { tenantId, wabaAccountId: waba.id, eventType: 'messages', phoneNumberId, waMessageId: msg.id, payload: msg, processed: false, receivedAt: new Date() },
  })

  // Upsert contact
  const contact = await prisma.contact.upsert({
    where:  { tenantId_phone: { tenantId, phone: from } },
    update: { name: value.contacts?.[0]?.profile?.name },
    create: { tenantId, phone: from, name: value.contacts?.[0]?.profile?.name, source: 'whatsapp', optedIn: true, labels: [] },
  })

  // Upsert conversation
  const conv = await prisma.conversation.upsert({
    where:  { id: (await prisma.conversation.findFirst({ where: { contactId: contact.id, tenantId } }))?.id || 'new' },
    update: { lastMessageAt: new Date(), unreadCount: { increment: 1 }, status: 'OPEN' },
    create: { tenantId, contactId: contact.id, status: 'OPEN', channel: 'whatsapp', lastMessageAt: new Date(), unreadCount: 1, labels: [] },
  })

  // Store message
  const storedMsg = await prisma.message.create({
    data: { conversationId: conv.id, wabaAccountId: waba.id, waMessageId: msg.id, direction: 'INBOUND', type: msgType, content: msg, status: 'DELIVERED', timestamp: new Date(parseInt(msg.timestamp) * 1000) },
  })

  // Lead classification — only if not a lead from same phone in last 24h
  const recent = await prisma.lead.findFirst({ where: { tenantId, phone: from, createdAt: { gte: new Date(Date.now() - 86400000) } } })
  if (!recent && text) {
    const category = classifyLead(text)
    if (category !== 'GENERAL' || text.length > 20) {
      const lead = await prisma.lead.create({
        data: { tenantId, contactId: contact.id, phone: from, name: contact.name, category, source: 'whatsapp', stage: 'NEW', priority: 'medium', message: text, smsSent: false, autoReplySent: false },
      })

      // Twilio SMS alert
      const owner = await prisma.user.findFirst({ where: { tenantId, role: { in: ['OWNER', 'ADMIN'] }, isActive: true } })
      if (owner?.phone && process.env.TWILIO_ACCOUNT_SID) {
        try {
          await sendLeadAlert({ ownerPhone: owner.phone, leadName: contact.name || from, phone: from, category, message: text })
          await prisma.lead.update({ where: { id: lead.id }, data: { smsSent: true } })
        } catch {}
      }

      // Auto-reply on WhatsApp
      try {
        await sendTextMessage(waba.phoneId, waba.accessToken, from, AUTO_REPLY, waba.apiVersion)
        await prisma.lead.update({ where: { id: lead.id }, data: { autoReplySent: true } })
      } catch {}

      // SSE broadcast
      broadcastToTenant(tenantId, 'NEW_LEAD', { lead, contact })
    }
  }

  // SSE broadcast new message
  broadcastToTenant(tenantId, 'NEW_MESSAGE', { conversationId: conv.id, message: storedMsg, contact })

  // Mark webhook processed
  await prisma.webhookEvent.updateMany({ where: { waMessageId: msg.id, tenantId }, data: { processed: true, processedAt: new Date() } })
}

async function processStatus(status: any) {
  const { id: waMessageId, status: msgStatus } = status
  const statusMap: any = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' }
  const prismaStatus = statusMap[msgStatus]
  if (!prismaStatus) return

  await prisma.message.updateMany({ where: { waMessageId }, data: { status: prismaStatus, ...(prismaStatus === 'READ' ? { readAt: new Date() } : {}), ...(prismaStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}) } })
}
