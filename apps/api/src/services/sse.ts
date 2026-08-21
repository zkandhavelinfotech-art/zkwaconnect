// Server-Sent Events broadcast service
import { FastifyInstance } from 'fastify'

const clients: Map<string, any[]> = new Map() // tenantId → [reply, ...]

export function registerSSEClient(tenantId: string, reply: any) {
  if (!clients.has(tenantId)) clients.set(tenantId, [])
  clients.get(tenantId)!.push(reply)
  reply.raw.on('close', () => removeSSEClient(tenantId, reply))
}

export function removeSSEClient(tenantId: string, reply: any) {
  const list = clients.get(tenantId)
  if (!list) return
  const idx = list.indexOf(reply)
  if (idx > -1) list.splice(idx, 1)
  if (list.length === 0) clients.delete(tenantId)
}

export function broadcastToTenant(tenantId: string, event: string, data: any) {
  const list = clients.get(tenantId)
  if (!list?.length) return
  const payload = `event: ${event}
data: ${JSON.stringify(data)}

`
  for (const reply of [...list]) {
    try {
      reply.raw.write(payload)
    } catch {
      removeSSEClient(tenantId, reply)
    }
  }
}
