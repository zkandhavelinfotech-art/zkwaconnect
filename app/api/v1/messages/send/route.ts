import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { normalizePhone } from "@/lib/contacts/phone"
import { apiError, apiHandler, contactInputSchema, upsertApiContact } from "@/lib/developer/api"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { findOrCreateConversation } from "@/lib/whatsapp/conversation"
import { sendAndRecord, type OutboundPayload } from "@/lib/whatsapp/send"

export const runtime = "nodejs"

const WINDOW_MS = 24 * 60 * 60 * 1000

const sendSchema = z.object({
  phone: z.string().optional(),
  to: z.string().optional(),
  message: z.string().optional(),
  text: z.union([z.string(), z.object({ body: z.string().min(1).max(4096), preview_url: z.boolean().optional() })]).optional(),
  type: z.enum(["text", "image", "document"]).default("text"),
  media_url: z.string().url().optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
  phone_number_id: z.string().optional(),
  contact: contactInputSchema.optional(),
})

// POST /api/v1/messages/send — direct text/media message sender
export const POST = apiHandler(
  async (request, { organizationId, keyId }) => {
    const body = await request.json()
    const input = sendSchema.parse(body)

    const rawPhone = input.phone || input.to
    if (!rawPhone) {
      return apiError(422, "missing_phone", "Provide 'phone' or 'to' with country code, e.g. 919876543210.")
    }
    const to = normalizePhone(rawPhone)
    if (!to) {
      return apiError(422, "invalid_phone", `Invalid phone number format: '${rawPhone}'.`)
    }

    let textBody = ""
    let previewUrl = true
    if (typeof input.text === "string") {
      textBody = input.text.trim()
    } else if (input.text && typeof input.text === "object") {
      textBody = input.text.body.trim()
      if (input.text.preview_url !== undefined) previewUrl = input.text.preview_url
    } else if (input.message) {
      textBody = input.message.trim()
    }

    if (input.type === "text" && !textBody) {
      return apiError(422, "missing_message", "Provide 'message' or 'text' content.")
    }

    const phones = await prisma.phoneNumber.findMany({
      where: { status: "CONNECTED", waba: { organizationId, status: "CONNECTED" } },
      orderBy: { createdAt: "asc" },
    })
    const phone = input.phone_number_id
      ? phones.find(p => p.id === input.phone_number_id || p.phoneNumberId === input.phone_number_id)
      : phones[0]

    if (!phone) {
      return apiError(
        409,
        input.phone_number_id ? "phone_not_found" : "no_phone_number",
        input.phone_number_id
          ? "Specified phone_number_id was not found in this workspace."
          : "Connect a WhatsApp Business number first."
      )
    }

    // Check 24-hour service window for freeform text/media messages
    const existing = await prisma.contact.findUnique({
      where: { organizationId_phone: { organizationId, phone: to } },
      select: { id: true },
    })
    const lastInbound = existing
      ? await prisma.message.findFirst({
          where: {
            direction: "INBOUND",
            conversation: { contactId: existing.id, phoneNumberId: phone.id },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : null

    if (!lastInbound || Date.now() - lastInbound.createdAt.getTime() > WINDOW_MS) {
      return apiError(
        409,
        "window_closed",
        "The customer has not messaged in the last 24 hours. WhatsApp policy requires sending an approved template outside this window. Use POST /api/v1/messages/template."
      )
    }

    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) {
      return apiError(409, "meta_not_connected", "Workspace is not connected to Meta Cloud API.")
    }

    const { contact } = await upsertApiContact(organizationId, to, input.contact || {})
    const conversation = await findOrCreateConversation({
      organizationId,
      phoneNumberId: phone.id,
      contactId: contact.id,
      reopen: false,
    })

    let payload: OutboundPayload
    let summary: string
    if (input.type === "text") {
      payload = { type: "text", text: { body: textBody, preview_url: previewUrl } }
      summary = textBody
    } else if (input.type === "image" && input.media_url) {
      payload = { type: "image", image: { link: input.media_url, caption: input.caption || textBody || undefined } }
      summary = input.caption || textBody || "Image"
    } else if (input.type === "document" && input.media_url) {
      payload = {
        type: "document",
        document: {
          link: input.media_url,
          filename: input.filename || "document.pdf",
          caption: input.caption || textBody || undefined,
        },
      }
      summary = input.filename || "Document"
    } else {
      payload = { type: "text", text: { body: textBody, preview_url: previewUrl } }
      summary = textBody
    }

    const meta: Record<string, string> = { source: "API", apiKeyId: keyId, endpoint: "messages/send" }
    const whatsappMessageId = await sendAndRecord(
      { accessToken, metaPhoneNumberId: phone.phoneNumberId, to, conversationId: conversation.id },
      payload,
      summary,
      meta
    )

    const row = await prisma.message.findFirst({
      where: { externalMessageId: whatsappMessageId },
      select: { id: true, createdAt: true },
    })

    return NextResponse.json(
      {
        id: row?.id,
        whatsapp_message_id: whatsappMessageId,
        status: "sent",
        phone: to,
        contact_id: contact.id,
        conversation_id: conversation.id,
        created_at: row?.createdAt || new Date(),
      },
      { status: 201 }
    )
  },
  { scope: "messages:send" }
)
