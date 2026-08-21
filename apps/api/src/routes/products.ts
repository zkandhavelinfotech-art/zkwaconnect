import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function productRoutes(app: FastifyInstance) {
  app.get('/', { onRequest:[app.authenticate] }, async (req) => {
    const products = await prisma.product.findMany({
      where: { tenantId: req.user.tid },
      orderBy: { createdAt: 'desc' },
    })
    return { success:true, data:products }
  })

  app.post('/', { onRequest:[app.authenticate] }, async (req, reply) => {
    const { name, description, price, currency='INR', imageUrl, sku, stock } = req.body as any
    if (!name || price===undefined) return reply.status(400).send({ success:false, error:'name and price required' })
    const p = await prisma.product.create({
      data:{ tenantId:req.user.tid, name, description, price:Number(price), currency, imageUrl, sku, stock, isActive:true },
    })
    return reply.status(201).send({ success:true, data:p })
  })

  app.patch('/:id', { onRequest:[app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const r = await prisma.product.updateMany({ where:{ id, tenantId:req.user.tid }, data:req.body as any })
    if (!r.count) return reply.status(404).send({ success:false, error:'Not found' })
    return { success:true }
  })

  app.delete('/:id', { onRequest:[app.authenticate] }, async (req) => {
    const { id } = req.params as any
    await prisma.product.deleteMany({ where:{ id, tenantId:req.user.tid } })
    return { success:true }
  })
}
