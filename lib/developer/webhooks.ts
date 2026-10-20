import crypto from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { safeFetch } from "@/lib/flows/safe-fetch"

export const WEBHOOK_EVENTS = {
  "message.received": "A customer sent a WhatsApp message",
  "message.status": "An outgoing message was sent, delivered, read or failed",
  "contact.created": "A new contact was added (inbound chat, form, import or API)",
  "conversation.assigned": "A chat was assigned to an agent",
  "order.created": "A new order (WhatsApp cart, Shopify or WooCommerce)",
  "order.updated": "An order's status changed",
  "form.submitted": "Someone submitted one of your forms",
  "contact.opted_out": "A contact replied STOP (unsubscribed from marketing)",
  "contact.opted_in": "A contact replied START (subscribed again)",
  "link.clicked": "A tracked link in a message was clicked",
} as const
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS | "webhook.test"

const RETRY_MINUTES = [1, 5, 30, 120, 360]
const DISABLE_AFTER_FAILURES = 50

export function newSecret() {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`
}

export function sign(secret: string, timestamp: string, body: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`
}

// Queue an event for every active endpoint of the workspace subscribed to it. Never throws.
export async function emitEvent(organizationId: string, event: WebhookEvent, data: Record<string, unknown>, onlyEndpointId?: string) {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { organizationId, active: true, ...(onlyEndpointId ? { id: onlyEndpointId } : {}) },
      select: { id: true, events: true } })
    const targets = endpoints.filter(endpoint => onlyEndpointId || (Array.isArray(endpoint.events) && endpoint.events.includes(event)))
    if (!targets.length) return 0
    const createdAt = new Date().toISOString()
    await prisma.webhookDelivery.createMany({ data: targets.map(endpoint => ({ endpointId: endpoint.id, organizationId, event,
      payload: { event, created_at: createdAt, organization_id: organizationId, data } as Prisma.InputJsonValue })) })
    return targets.length
  } catch (error) {
    console.error("[webhooks] could not queue event", event, error)
    return 0
  }
}

type Claimed = { id: string; endpointId: string; event: string; payload: Prisma.JsonValue; attempts: number }

// Sends due deliveries (claimed with SKIP LOCKED, so several instances can run this). Returns how many were attempted.
export async function deliverWebhooks(limit = 25) {
  await prisma.webhookDelivery.updateMany({ where: { status: "SENDING", lockedAt: { lt: new Date(Date.now() - 2 * 60_000) } }, data: { status: "PENDING", lockedAt: null } })
  const claimed = await prisma.$queryRaw<Claimed[]>`
    UPDATE webhook_deliveries SET status = 'SENDING', "lockedAt" = now()
    WHERE id IN (SELECT id FROM webhook_deliveries WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
                 ORDER BY "createdAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, "endpointId", event, payload, attempts`
  await Promise.all(claimed.map(deliverOne))
  return claimed.length
}

async function deliverOne(delivery: Claimed) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } })
  if (!endpoint || !endpoint.active) {
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lockedAt: null, error: "Endpoint disabled or deleted." } })
    return
  }
  const body = JSON.stringify({ id: delivery.id, ...(delivery.payload as object) })
  const timestamp = String(Math.floor(Date.now() / 1000))
  let status: number | null = null
  let error: string | null = null
  try {
    const result = await safeFetch(endpoint.url, { method: "POST", body, headers: {
      "User-Agent": "ZKWAConnect-Webhooks/1.0", "X-ZKWA-Event": delivery.event, "X-ZKWA-Delivery": delivery.id,
      "X-ZKWA-Timestamp": timestamp, "X-ZKWA-Signature": sign(endpoint.secret, timestamp, body) } })
    status = result.status
    const appsScriptDone = /^https:\/\/script\.google\.com\//.test(endpoint.url) && [302, 303].includes(result.status)
    if (!result.ok && !appsScriptDone) error = `HTTP ${result.status}${result.text ? `: ${result.text.slice(0, 200)}` : ""}`
  } catch (reason) {
    error = reason instanceof Error ? reason.message.slice(0, 300) : "Request failed"
  }
  const now = new Date()
  const attempts = delivery.attempts + 1
  if (!error) {
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "DELIVERED", attempts, responseStatus: status, deliveredAt: now, lockedAt: null, error: null } })
    await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { failureCount: 0, lastDeliveryAt: now, lastStatus: status, lastError: null } })
    return
  }
  const retry = attempts <= RETRY_MINUTES.length
  await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { attempts, responseStatus: status, error, lockedAt: null,
    ...(retry ? { status: "PENDING", nextAttemptAt: new Date(now.getTime() + RETRY_MINUTES[attempts - 1] * 60_000) } : { status: "FAILED" }) } })
  const updated = await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { failureCount: { increment: 1 }, lastDeliveryAt: now, lastStatus: status, lastError: error } })
  if (updated.failureCount >= DISABLE_AFTER_FAILURES && updated.active) {
    await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { active: false } })
    await prisma.notification.create({ data: { organizationId: endpoint.organizationId, type: "WEBHOOK_DISABLED", title: "Webhook endpoint turned off",
      message: `${endpoint.url} failed ${DISABLE_AFTER_FAILURES} times in a row and was turned off. Fix it and turn it back on under Developers.` } }).catch(() => null)
  }
}
