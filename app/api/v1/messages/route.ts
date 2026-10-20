import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { normalizePhone } from "@/lib/contacts/phone"
import { apiError, apiHandler, contactInputSchema, upsertApiContact } from "@/lib/developer/api"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { findOrCreateConversation } from "@/lib/whatsapp/conversation"
import { sendAndRecord, type OutboundPayload } from "@/lib/whatsapp/send"
import { buildTemplateMessage } from "@/lib/whatsapp/template-media"

export const runtime = "nodejs"

const WINDOW_MS = 24 * 60 * 60 * 1000
const media = z.object({ url: z.string().url().startsWith("https://", "Media URLs must be https"), caption: z.string().max(1024).optional(), filename: z.string().max(240).optional() })

const schema = z.object({
  to: z.string().min(1),
  phone_number_id: z.string().optional(),
  type: z.enum(["text", "template", "image", "video", "audio", "document"]),
  text: z.object({ body: z.string().trim().min(1).max(4096), preview_url: z.boolean().optional() }).optional(),
  template: z.object({ name: z.string().min(1), language: z.string().optional(), variables: z.array(z.string().trim().min(1).max(1024)).max(20).optional() }).optional(),
  image: media.optional(), video: media.optional(), audio: media.optional(), document: media.optional(),
  contact: contactInputSchema.optional(),
})

// POST /api/v1/messages — send a WhatsApp message (template any time; text/media inside the 24-hour window).
export const POST = apiHandler(async (request, { organizationId, keyId }) => {
  const input = schema.parse(await request.json())
  const to = normalizePhone(input.to)
  if (!to) return apiError(422, "invalid_phone", "`to` must be a phone number with country code, e.g. 919876543210.")
  if (!input[input.type]) return apiError(422, "invalid_request", `Include a \`${input.type}\` object for type "${input.type}".`)

  const phones = await prisma.phoneNumber.findMany({ where: { status: "CONNECTED", waba: { organizationId, status: "CONNECTED" } }, orderBy: { createdAt: "asc" } })
  const phone = input.phone_number_id ? phones.find(item => item.id === input.phone_number_id || item.phoneNumberId === input.phone_number_id) : phones[0]
  if (!phone) return apiError(409, input.phone_number_id ? "phone_not_found" : "no_phone_number",
    input.phone_number_id ? "That phone_number_id isn't a connected number in this workspace." : "Connect a WhatsApp number to this workspace first.")
  // Validate everything about the request before touching contacts or WhatsApp.
  let template: Awaited<ReturnType<typeof prisma.template.findMany>>[number] | null = null
  if (input.type === "template") {
    const wanted = input.template!
    const templates = await prisma.template.findMany({ where: { organizationId, wabaId: phone.wabaId, status: "APPROVED", name: wanted.name,
      ...(wanted.language ? { language: wanted.language } : {}) } })
    if (!templates.length) return apiError(404, "template_not_found", `No approved template named "${wanted.name}"${wanted.language ? ` in ${wanted.language}` : ""} for this number.`)
    if (templates.length > 1) return apiError(422, "language_required", `"${wanted.name}" exists in ${templates.map(item => item.language).join(", ")}. Pass template.language.`)
    template = templates[0]
    const needed = new Set([...(template.content || "").matchAll(/\{\{(\d+)\}\}/g)].map(match => match[1])).size
    const count = (wanted.variables || []).length
    if (count !== needed) return apiError(422, "variables_mismatch", `Template "${template.name}" needs ${needed} variable(s); you sent ${count}.`)
  } else {
    const existing = await prisma.contact.findUnique({ where: { organizationId_phone: { organizationId, phone: to } }, select: { id: true } })
    const lastInbound = existing ? await prisma.message.findFirst({ where: { direction: "INBOUND", conversation: { contactId: existing.id, phoneNumberId: phone.id } },
      orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null
    if (!lastInbound || Date.now() - lastInbound.createdAt.getTime() > WINDOW_MS)
      return apiError(409, "window_closed", "The customer hasn't messaged in the last 24 hours, so WhatsApp only allows a template. Send type \"template\".")
  }
  const accessToken = await getMetaAccessToken(organizationId)
  if (!accessToken) return apiError(409, "meta_not_connected", "This workspace isn't connected to Meta. Reconnect Facebook in ZKWAConnect.")

  const { contact } = await upsertApiContact(organizationId, to, input.contact || {})
  const conversation = await findOrCreateConversation({ organizationId, phoneNumberId: phone.id, contactId: contact.id, reopen: false })

  let payload: OutboundPayload
  let summary: string
  const meta: Record<string, string> = { source: "API", apiKeyId: keyId }
  if (template) {
    const variables = input.template!.variables || []
    payload = { type: "template", template: await buildTemplateMessage(template, variables, { accessToken, metaPhoneNumberId: phone.phoneNumberId }) }
    summary = (template.content || template.name).replace(/\{\{(\d+)\}\}/g, (match, number) => variables[Number(number) - 1] ?? match)
    meta.templateId = template.id
  } else {
    if (input.type === "text") {
      payload = { type: "text", text: { preview_url: input.text!.preview_url ?? true, body: input.text!.body } }
      summary = input.text!.body
    } else {
      const kind = input.type as "image" | "video" | "audio" | "document"
      const item = input[kind]!
      payload = { type: kind, [kind]: { link: item.url, ...(item.caption && kind !== "audio" ? { caption: item.caption } : {}),
        ...(kind === "document" && item.filename ? { filename: item.filename } : {}) } }
      summary = item.caption || ""
    }
  }
  const messageId = await sendAndRecord({ accessToken, metaPhoneNumberId: phone.phoneNumberId, to, conversationId: conversation.id }, payload, summary, meta)
  const row = await prisma.message.findFirst({ where: { externalMessageId: messageId }, select: { id: true } })
  return NextResponse.json({ id: row?.id, whatsapp_message_id: messageId, status: "sent", to, contact_id: contact.id, conversation_id: conversation.id }, { status: 201 })
})
