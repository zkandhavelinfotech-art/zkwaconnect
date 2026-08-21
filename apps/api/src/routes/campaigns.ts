import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { campaignQueue } from '../jobs/campaignWorker'

export async function campaignRoutes(app: FastifyInstance) {

  // GET /campaigns
  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    const { page = 1, pageSize = 20 } = req.query as any
    const skip = (Number(page) - 1) * Number(pageSize)
    const where = { tenantId: req.user.tid }
    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where, skip, take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: { template: { select: { id: true, name: true, category: true } } },
      }),
      prisma.campaign.count({ where }),
    ])
    return { success: true, data: { campaigns, total, page: Number(page), totalPages: Math.ceil(total / Number(pageSize)) } }
  })

  // POST /campaigns — create with audience options
  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { name, templateId, wabaAccountId, scheduledAt,
            audienceType = 'all',   // all | labels | contacts | csv
            audienceLabels = [],    // label filter
            audienceContacts = [],  // explicit contact IDs
    } = req.body as any

    if (!name || !templateId || !wabaAccountId)
      return reply.status(400).send({ success: false, error: 'name, templateId, wabaAccountId required' })

    // Count audience
    let totalCount = 0
    if (audienceType === 'all') {
      totalCount = await prisma.contact.count({ where: { tenantId: req.user.tid, optedIn: true } })
    } else if (audienceType === 'labels' && audienceLabels.length > 0) {
      totalCount = await prisma.contact.count({ where: { tenantId: req.user.tid, optedIn: true, labels: { hasSome: audienceLabels } } })
    } else if (audienceType === 'contacts' && audienceContacts.length > 0) {
      totalCount = audienceContacts.length
    }

    const campaign = await prisma.campaign.create({
      data: {
        tenantId: req.user.tid, name, templateId, wabaAccountId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: 'DRAFT', totalCount,
        audience: { type: audienceType, labels: audienceLabels, contacts: audienceContacts },
      },
    })
    return reply.status(201).send({ success: true, data: campaign })
  })

  // POST /campaigns/upload-csv — parse CSV and return contact phones
  app.post('/upload-csv', { onRequest: [app.authenticate] }, async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.status(400).send({ success: false, error: 'CSV file required' })

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf-8')

    // Parse CSV — expect header row with "phone" column (or first column = phone)
    const lines   = text.split(/\r?\n/).filter(l => l.trim())
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
    const phoneIdx = headers.indexOf('phone') >= 0 ? headers.indexOf('phone') : 0
    const nameIdx  = headers.indexOf('name')

    const contacts: { phone: string; name?: string }[] = []
    const invalid: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols  = lines[i].split(',').map(c => c.trim().replace(/['"]/g, ''))
      const phone = cols[phoneIdx]?.trim()
      if (!phone) continue
      // Basic phone validation: starts with + or digits, min 10 chars
      if (/^[+0-9]{10,15}$/.test(phone.replace(/[-\s]/g, ''))) {
        contacts.push({ phone, name: nameIdx >= 0 ? cols[nameIdx] : undefined })
      } else {
        invalid.push(phone)
      }
    }

    // Upsert contacts into DB
    let upserted = 0
    for (const c of contacts) {
      await prisma.contact.upsert({
        where:  { tenantId_phone: { tenantId: req.user.tid, phone: c.phone } },
        update: { name: c.name || undefined },
        create: { tenantId: req.user.tid, phone: c.phone, name: c.name, source: 'csv', optedIn: true, labels: [] },
      }).catch(() => {})
      upserted++
    }

    return {
      success: true,
      data: {
        total:    contacts.length,
        upserted,
        invalid:  invalid.slice(0, 10), // show first 10 invalid
        phones:   contacts.map(c => c.phone),
      },
    }
  })

  // POST /campaigns/:id/launch — launch with audience filter
  app.post('/:id/launch', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const campaign = await prisma.campaign.findFirst({
      where:   { id, tenantId: req.user.tid },
      include: { template: true, wabaAccount: true },
    })
    if (!campaign) return reply.status(404).send({ success: false, error: 'Not found' })
    if (!['DRAFT', 'PAUSED'].includes(campaign.status))
      return reply.status(400).send({ success: false, error: `Cannot launch campaign in ${campaign.status} status` })

    await prisma.campaign.update({ where: { id }, data: { status: 'RUNNING', startedAt: new Date() } })

    // Resolve audience
    const audience = campaign.audience as any
    const aType    = audience?.type || 'all'
    const aLabels  = audience?.labels || []
    const aIds     = audience?.contacts || []

    let contactWhere: any = { tenantId: req.user.tid, optedIn: true }
    if (aType === 'labels' && aLabels.length > 0) {
      contactWhere.labels = { hasSome: aLabels }
    } else if (aType === 'contacts' && aIds.length > 0) {
      contactWhere.id = { in: aIds }
    }

    const contacts = await prisma.contact.findMany({ where: contactWhere, select: { phone: true } })

    // Update total count
    await prisma.campaign.update({ where: { id }, data: { totalCount: contacts.length } })

    // Enqueue BullMQ jobs
    for (const contact of contacts) {
      await campaignQueue.add('send', {
        campaignId:   campaign.id,
        contactPhone: contact.phone,
        wabaId:       campaign.wabaAccountId,
        templateName: campaign.template?.name,
        languageCode: campaign.template?.language || 'en',
        components:   [],
      }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } })
    }

    return { success: true, data: { queued: contacts.length } }
  })

  // POST /campaigns/:id/pause
  app.post('/:id/pause', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    await prisma.campaign.updateMany({ where: { id, tenantId: req.user.tid, status: 'RUNNING' }, data: { status: 'PAUSED' } })
    return { success: true }
  })

  // POST /campaigns/:id/cancel
  app.post('/:id/cancel', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    await prisma.campaign.updateMany({
      where: { id, tenantId: req.user.tid, status: { in: ['DRAFT', 'PAUSED', 'SCHEDULED'] } },
      data:  { status: 'CANCELLED' },
    })
    return { success: true }
  })
}
