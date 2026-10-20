import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { emitEvent, newSecret, WEBHOOK_EVENTS } from "@/lib/developer/webhooks"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: errorStatus(error) })
const eventNames = Object.keys(WEBHOOK_EVENTS) as [keyof typeof WEBHOOK_EVENTS, ...(keyof typeof WEBHOOK_EVENTS)[]]
const urlSchema = z.string().trim().url("Enter a full URL.").max(500).refine(url => url.startsWith("https://"), "Webhook URLs must start with https://")

export async function GET() {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" },
      select: { id: true, url: true, events: true, description: true, active: true, failureCount: true, lastDeliveryAt: true, lastStatus: true, lastError: true, createdAt: true,
        deliveries: { orderBy: { createdAt: "desc" }, take: 15, select: { id: true, event: true, status: true, attempts: true, responseStatus: true, error: true, createdAt: true, deliveredAt: true, nextAttemptAt: true } } } })
    return NextResponse.json({ endpoints, events: WEBHOOK_EVENTS })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const body = await request.json()
    if (body.action === "test") {
      const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: String(body.id || ""), organizationId } })
      if (!endpoint) return NextResponse.json({ error: "Endpoint not found." }, { status: 404 })
      if (!endpoint.active) return NextResponse.json({ error: "Turn the endpoint on first." }, { status: 409 })
      await emitEvent(organizationId, "webhook.test", { message: "Test event from ZKWAConnect. If you can read this, your endpoint works." }, endpoint.id)
      return NextResponse.json({ ok: true, message: "Test event queued — it's delivered within a few seconds. Check the delivery log below." })
    }
    const input = z.object({ url: urlSchema, events: z.array(z.enum(eventNames)).min(1, "Pick at least one event."), description: z.string().trim().max(120).optional() }).parse(body)
    if (await prisma.webhookEndpoint.count({ where: { organizationId } }) >= 10) throw new Error("Up to 10 webhook endpoints.")
    const secret = newSecret()
    const endpoint = await prisma.webhookEndpoint.create({ data: { organizationId, url: input.url, events: input.events, description: input.description || null, secret } })
    return NextResponse.json({ id: endpoint.id, secret, message: "Endpoint added. Copy the signing secret now — it won't be shown again." }, { status: 201 })
  } catch (error) { return fail(error) }
}

export async function PATCH(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const input = z.object({ id: z.string().min(1), url: urlSchema.optional(), events: z.array(z.enum(eventNames)).min(1).optional(), active: z.boolean().optional(),
      rotateSecret: z.boolean().optional() }).parse(await request.json())
    const secret = input.rotateSecret ? newSecret() : undefined
    const updated = await prisma.webhookEndpoint.updateMany({ where: { id: input.id, organizationId }, data: {
      ...(input.url ? { url: input.url } : {}), ...(input.events ? { events: input.events } : {}),
      ...(input.active !== undefined ? { active: input.active, ...(input.active ? { failureCount: 0 } : {}) } : {}), ...(secret ? { secret } : {}) } })
    if (!updated.count) return NextResponse.json({ error: "Endpoint not found." }, { status: 404 })
    return NextResponse.json({ ok: true, ...(secret ? { secret, message: "New signing secret created. Update your server — the old one stops working now." } : { message: "Saved." }) })
  } catch (error) { return fail(error) }
}

export async function DELETE(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    await prisma.webhookEndpoint.deleteMany({ where: { id: new URL(request.url).searchParams.get("id") || "", organizationId } })
    return NextResponse.json({ ok: true, message: "Endpoint deleted." })
  } catch (error) { return fail(error) }
}
