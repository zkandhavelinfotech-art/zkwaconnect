import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { openSecrets, processStoreEvent, verifyStoreSignature } from "@/lib/integrations/store"

export const runtime = "nodejs"

// Shopify / WooCommerce webhooks for one connected store. Verified with HMAC; duplicates are ignored.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = await request.text()
  const integration = await prisma.integration.findUnique({ where: { id } })
  if (!integration || !["SHOPIFY", "WOOCOMMERCE"].includes(integration.type)) return NextResponse.json({ error: "Unknown store" }, { status: 404 })
  // WooCommerce pings a new webhook with a form-encoded "webhook_id=…" body before signing anything.
  if (integration.type === "WOOCOMMERCE" && /^webhook_id=\d+$/.test(raw.trim())) return NextResponse.json({ ok: true })
  if (!verifyStoreSignature(integration.type, openSecrets(integration.secretEncrypted), raw, request.headers))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  if (integration.status !== "ACTIVE") return NextResponse.json({ ok: true, ignored: "integration paused" })

  const topic = request.headers.get("x-shopify-topic") || request.headers.get("x-wc-webhook-topic") || request.headers.get("x-zkwa-topic") || ""
  const deliveryId = request.headers.get("x-shopify-webhook-id") || request.headers.get("x-wc-webhook-delivery-id") || request.headers.get("x-zkwa-delivery")
  const eventId = deliveryId ? `${integration.type.toLowerCase()}:${integration.id}:${deliveryId}` : null
  if (eventId && await prisma.webhookEvent.findFirst({ where: { externalEventId: eventId }, select: { id: true } })) return NextResponse.json({ ok: true, duplicate: true })
  let payload: Record<string, unknown>
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const event = await prisma.webhookEvent.create({ data: { organizationId: integration.organizationId, eventType: `${integration.type.toLowerCase()}.${topic}`,
    externalEventId: eventId, payload: payload as Prisma.InputJsonValue, status: "RECEIVED" } })
  try {
    const result = await processStoreEvent(integration.id, topic, payload)
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), error: result } })
    await prisma.integration.update({ where: { id: integration.id }, data: { lastEventAt: new Date() } })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed"
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "FAILED", error: message.slice(0, 500) } })
    await prisma.integration.update({ where: { id: integration.id }, data: { lastError: message.slice(0, 300), lastEventAt: new Date() } })
    // 200 so the store doesn't retry forever on a data problem; the error is shown on the Integrations page.
    return NextResponse.json({ ok: false, error: message })
  }
}
