import { NextResponse } from "next/server"
import crypto from "crypto"
import { prisma } from "@/lib/db/prisma"
import { recordLifecycleLog } from "@/lib/whatsapp/lifecycle"

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

// Validates X-Hub-Signature-256 header using SHA-256 HMAC
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret || !signatureHeader) return true // skip if not configured in dev
  try {
    const [algorithm, signature] = signatureHeader.split("=")
    if (algorithm !== "sha256" || !signature) return false
    const hmac = crypto.createHmac("sha256", appSecret)
    const digest = hmac.update(rawBody).digest("hex")
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(digest, "hex"))
  } catch {
    return false
  }
}

// POST /api/whatsapp/webhooks/meta
// Ingests real-time events: incoming customer messages, delivery receipts, quality rating changes, and template status updates.
export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get("x-hub-signature-256")

    if (!verifyMetaSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const body = JSON.parse(rawBody)
    if (!body || body.object !== "whatsapp_business_account") {
      return NextResponse.json({ received: false }, { status: 404 })
    }

    const entries = body.entry || []
    for (const entry of entries) {
      const wabaId = entry.id
      const changes = entry.changes || []

      for (const change of changes) {
        const field = change.field
        const value = change.value || {}

        // 1. MESSAGES & DELIVERY STATUS RECEIPTS
        if (field === "messages") {
          const statuses = value.statuses || []
          const messages = value.messages || []
          const phoneNumberId = value.metadata?.phone_number_id

          // Process delivery receipts (sent, delivered, read, failed)
          for (const status of statuses) {
            const messageId = status.id
            const statusStr = status.status?.toUpperCase()
            const error = status.errors?.[0]

            if (messageId && statusStr) {
              await prisma.message.updateMany({
                where: { externalMessageId: messageId },
                data: {
                  status: statusStr === "READ" ? "READ" : statusStr === "DELIVERED" ? "DELIVERED" : statusStr === "FAILED" ? "FAILED" : "SENT",
                  ...(statusStr === "DELIVERED" ? { deliveredAt: new Date() } : {}),
                  ...(statusStr === "READ" ? { readAt: new Date() } : {}),
                  ...(error ? { metadata: { metaError: `Meta Error ${error.code}: ${error.title || error.message}` } } : {}),
                },
              })
            }
          }

          // Ingest incoming customer messages
          for (const msg of messages) {
            const senderPhone = msg.from
            const msgType = msg.type || "text"
            const textBody = msg.text?.body || msg.interactive?.button_reply?.title || ""

            // Find matching phone number and workspace
            if (phoneNumberId) {
              const phone = await prisma.phoneNumber.findUnique({
                where: { phoneNumberId },
                include: { waba: true },
              })

              if (phone) {
                // Upsert Contact
                const contact = await prisma.contact.upsert({
                  where: {
                    organizationId_phone: {
                      organizationId: phone.waba.organizationId,
                      phone: senderPhone,
                    },
                  },
                  create: {
                    organizationId: phone.waba.organizationId,
                    phone: senderPhone,
                    name: value.contacts?.[0]?.profile?.name || senderPhone,
                  },
                  update: {
                    name: value.contacts?.[0]?.profile?.name || undefined,
                  },
                })

                // Find or create active conversation
                let conversation = await prisma.conversation.findFirst({
                  where: {
                    organizationId: phone.waba.organizationId,
                    contactId: contact.id,
                    phoneNumberId: phone.id,
                  },
                })

                if (!conversation) {
                  conversation = await prisma.conversation.create({
                    data: {
                      organizationId: phone.waba.organizationId,
                      contactId: contact.id,
                      phoneNumberId: phone.id,
                      lastMessageAt: new Date(),
                    },
                  })
                }

                // Record inbound message
                await prisma.message.create({
                  data: {
                    conversationId: conversation.id,
                    externalMessageId: msg.id,
                    direction: "INBOUND",
                    type: msgType.toUpperCase(),
                    content: textBody,
                    status: "DELIVERED",
                    createdAt: new Date(Number(msg.timestamp) * 1000 || Date.now()),
                  },
                })
              }
            }
          }

          // Quality rating update
          if (phoneNumberId && value.quality_rating) {
            await prisma.phoneNumber.updateMany({
              where: { phoneNumberId },
              data: { qualityRating: value.quality_rating },
            })
          }
        }

        // 2. TEMPLATE STATUS UPDATES (APPROVED, REJECTED, PAUSED)
        if (field === "message_template_status_update") {
          const templateName = value.message_template_name
          const event = value.event?.toUpperCase()

          if (templateName && event) {
            await prisma.template.updateMany({
              where: { name: templateName },
              data: {
                status: event === "APPROVED" ? "APPROVED" : event === "REJECTED" ? "REJECTED" : "PAUSED",
              },
            })
          }
        }

        // 3. ACCOUNT REVIEW & STATUS UPDATES
        if (field === "account_update") {
          const phoneId = value.phone_number_id
          const newQuality = value.quality_rating

          if (phoneId && newQuality) {
            await prisma.phoneNumber.updateMany({
              where: { phoneNumberId: phoneId },
              data: { qualityRating: newQuality },
            })
          }
        }

        // 4. PHONE NUMBER DISPLAY NAME STATUS UPDATE
        if (field === "phone_number_name_update") {
          const phoneId = value.phone_number_id
          const decision = value.decision?.toUpperCase() // "APPROVED" or "DECLINED"
          const requestedName = value.requested_verified_name
          const rejectionReason = value.rejection_reason

          if (phoneId) {
            const phone = await prisma.phoneNumber.findUnique({
              where: { phoneNumberId: phoneId },
              include: { waba: true },
            })

            if (phone) {
              if (decision === "APPROVED" && requestedName) {
                await prisma.phoneNumber.update({
                  where: { phoneNumberId: phoneId },
                  data: {
                    displayName: requestedName,
                    verificationStatus: "VERIFIED",
                  },
                })
                await recordLifecycleLog({
                  organizationId: phone.waba.organizationId,
                  eventType: "DISPLAY_NAME_APPROVED",
                  statusTo: "CONNECTED",
                  sanitizedMessage: `Display name '${requestedName}' was officially approved by Meta.`,
                })
              } else if (decision === "DECLINED") {
                await recordLifecycleLog({
                  organizationId: phone.waba.organizationId,
                  eventType: "DISPLAY_NAME_DECLINED",
                  statusTo: "ACTION_REQUIRED",
                  rawError: { code: "DISPLAY_NAME_REJECTED", reason: rejectionReason },
                  sanitizedMessage: `Meta rejected display name '${requestedName || phone.displayName}'. Reason: ${rejectionReason || "Guidelines violation"}.`,
                })
              }
            }
          }
        }

        // 5. PHONE NUMBER QUALITY RATING CHANGE
        if (field === "phone_number_quality_update") {
          const phoneId = value.phone_number_id
          const currentLimit = value.current_limit
          const event = value.event // "FLAGGED", "RESTRICTED", etc.

          if (phoneId) {
            const phone = await prisma.phoneNumber.findUnique({
              where: { phoneNumberId: phoneId },
              include: { waba: true },
            })

            if (phone && event) {
              await recordLifecycleLog({
                organizationId: phone.waba.organizationId,
                eventType: `QUALITY_${event.toUpperCase()}`,
                statusTo: event === "RESTRICTED" ? "SUSPENDED" : "CONNECTED",
                sanitizedMessage: `WhatsApp number quality status changed to ${event}. Daily limit: ${currentLimit || "Standard"}.`,
              })
            }
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
