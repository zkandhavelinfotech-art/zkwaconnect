import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function webhookEventRoutes(app: FastifyInstance) {
  app.get('/', { onRequest:[app.authenticate] }, async (req) => {
    const { page=1, pageSize=50 } = req.query as any
    const skip = (Number(page)-1) * Number(pageSize)
    const [events, total] = await Promise.all([
      prisma.webhookEvent.findMany({
        where:{ tenantId:req.user.tid },
        orderBy:{ receivedAt:'desc' },
        skip, take:Number(pageSize),
      }),
      prisma.webhookEvent.count({ where:{ tenantId:req.user.tid } }),
    ])
    return { success:true, data:{ events, total, page:Number(page), totalPages:Math.ceil(total/Number(pageSize)) } }
  })
}
