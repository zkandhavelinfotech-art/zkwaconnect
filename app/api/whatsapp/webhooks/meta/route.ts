import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

export const runtime = "nodejs"

// GET /api/whatsapp/webhooks/meta
// Handles Meta's webhook verification challenge when subscribing webhook events in App Dashboard.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const expectedToken = process.env.META_VERIFY_TOKEN || "zkwaconnect_webhook_verify_token"

  if (mode === "subscribe" && token === expectedToken) {
    return new Response(challenge || "", { status: 200 })
  }

  return NextResponse.json({ error: "Forbidden verification token" }, { status: 403 })
}

// POST /api/whatsapp/webhooks/meta
// Ingests real-time events: incoming customer messages, delivery statuses, quality rating changes.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || body.object !== "whatsapp_business_account") {
      return NextResponse.json({ received: false }, { status: 404 })
    }

    const entries = body.entry || []
    for (const entry of entries) {
      const changes = entry.changes || []
      for (const change of changes) {
        if (change.field === "messages") {
          const value = change.value || {}
          const statuses = value.statuses || []
          const messages = value.messages || []

          // Process delivery receipts (sent, delivered, read, failed)
          for (const status of statuses) {
            const messageId = status.id
            const statusStr = status.status?.toUpperCase()

            if (messageId && statusStr) {
              await prisma.message.updateMany({
                where: { externalId: messageId },
                data: {
                  status: statusStr === "READ" ? "READ" : statusStr === "DELIVERED" ? "DELIVERED" : statusStr === "FAILED" ? "FAILED" : "SENT",
                  ...(statusStr === "DELIVERED" ? { deliveredAt: new Date() } : {}),
                  ...(statusStr === "READ" ? { readAt: new Date() } : {}),
                },
              })
            }
          }

          // Process quality rating updates or account review updates
          if (value.metadata?.phone_number_id && value.quality_rating) {
            await prisma.phoneNumber.updateMany({
              where: { phoneNumberId: value.metadata.phone_number_id },
              data: { qualityRating: value.quality_rating },
            })
          }
        }
      }
    }

    return NextResponse.json({ ok: true, received: true }, { status: 200 })
  } catch (error: any) {
    console.error("[WHATSAPP_WEBHOOK_META_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Webhook processing error" }, { status: 500 })
  }
}
