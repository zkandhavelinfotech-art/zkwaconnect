import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { createHash, randomBytes } from 'crypto'

function generateKey(): { key: string; prefix: string; hash: string } {
  const raw    = `zkwa_${randomBytes(24).toString('hex')}`
  const prefix = raw.substring(0, 12)
  const hash   = createHash('sha256').update(raw).digest('hex')
  return { key:raw, prefix, hash }
}

export async function apiKeyRoutes(app: FastifyInstance) {
  app.get('/', { onRequest:[app.authenticate] }, async (req) => {
    const keys = await prisma.apiKey.findMany({
      where:{ tenantId:req.user.tid },
      orderBy:{ createdAt:'desc' },
      select:{ id:true, name:true, keyPrefix:true, permissions:true, isActive:true, lastUsedAt:true, createdAt:true, expiresAt:true },
    })
    return { success:true, data:keys }
  })

  app.post('/', { onRequest:[app.authenticate] }, async (req, reply) => {
    const { name, permissions=[], expiresAt } = req.body as any
    if (!name) return reply.status(400).send({ success:false, error:'name required' })
    const { key, prefix, hash } = generateKey()
    await prisma.apiKey.create({
      data:{ tenantId:req.user.tid, name, keyHash:hash, keyPrefix:prefix, permissions, isActive:true, expiresAt:expiresAt?new Date(expiresAt):null },
    })
    // Return the full key once — never stored, cannot be recovered
    return reply.status(201).send({ success:true, data:{ key, prefix, name, note:'Save this key now. It will not be shown again.' } })
  })

  app.patch('/:id/deactivate', { onRequest:[app.authenticate] }, async (req) => {
    const { id } = req.params as any
    await prisma.apiKey.updateMany({ where:{ id, tenantId:req.user.tid }, data:{ isActive:false } })
    return { success:true }
  })

  app.delete('/:id', { onRequest:[app.authenticate] }, async (req) => {
    const { id } = req.params as any
    await prisma.apiKey.deleteMany({ where:{ id, tenantId:req.user.tid } })
    return { success:true }
  })
}
