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

const templateSchema = z.object({
  phone: z.string().optional(),
  to: z.string().optional(),
  name: z.string().optional(),
  template: z.union([z.string(), z.object({ name: z.string(), language: z.string().optional(), variables: z.array(z.string()).optional() })]).optional(),
  template_name: z.string().optional(),
  language: z.string().optional(),
  variables: z.array(z.string().or(z.number())).optional(),
  header_media_url: z.string().url().optional(),
  phone_number_id: z.string().optional(),
  contact: contactInputSchema.optional(),
})

// POST /api/v1/messages/template — send an approved WhatsApp template anytime (bypasses 24h window)
export const POST = apiHandler(
  async (request, { organizationId, keyId }) => {
    const body = await request.json()
    const input = templateSchema.parse(body)

    const rawPhone = input.phone || input.to
    if (!rawPhone) {
      return apiError(422, "missing_phone", "Provide 'phone' or 'to' with country code, e.g. 919876543210.")
    }
    const to = normalizePhone(rawPhone)
    if (!to) {
      return apiError(422, "invalid_phone", `Invalid phone number format: '${rawPhone}'.`)
    }

    let tName = ""
    let tLang = input.language || "en"
    let tVars: string[] = []

    if (typeof input.template === "string") {
      tName = input.template
    } else if (input.template && typeof input.template === "object") {
      tName = input.template.name
      if (input.template.language) tLang = input.template.language
      if (input.template.variables) tVars = input.template.variables
    } else if (input.template_name) {
      tName = input.template_name
    } else if (input.name) {
      tName = input.name
    }

    if (!tName) {
      return apiError(422, "missing_template_name", "Specify template name as 'name' or 'template_name'.")
    }

    if (input.variables && input.variables.length > 0) {
      tVars = input.variables.map(v => String(v))
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

    const templates = await prisma.template.findMany({
      where: {
        organizationId,
        wabaId: phone.wabaId,
        status: "APPROVED",
        name: tName,
        ...(tLang ? { language: tLang } : {}),
      },
    })

    if (!templates.length) {
      return apiError(
        404,
        "template_not_found",
        `No approved template named '${tName}'${tLang ? ` in language '${tLang}'` : ""} found for this number.`
      )
    }

    const template = templates[0]
    const needed = new Set([...(template.content || "").matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size
    if (tVars.length !== needed) {
      return apiError(
        422,
        "variables_mismatch",
        `Template '${template.name}' expects ${needed} variable(s); received ${tVars.length}.`
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

    const templatePayload = await buildTemplateMessage(template, tVars, {
      accessToken,
      metaPhoneNumberId: phone.phoneNumberId,
    })

    const summary = (template.content || template.name).replace(
      /\{\{(\d+)\}\}/g,
      (match, num) => tVars[Number(num) - 1] ?? match
    )

    const payload: OutboundPayload = { type: "template", template: templatePayload }
    const meta: Record<string, string> = {
      source: "API",
      apiKeyId: keyId,
      endpoint: "messages/template",
      templateId: template.id,
    }

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
        template: {
          name: template.name,
          language: template.language,
          variables: tVars,
        },
        contact_id: contact.id,
        conversation_id: conversation.id,
        created_at: row?.createdAt || new Date(),
      },
      { status: 201 }
    )
  },
  { scope: "messages:send" }
)

