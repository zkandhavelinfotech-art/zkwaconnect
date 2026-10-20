import { NextResponse } from "next/server"
import { hasFeature } from "@/lib/billing/limits"
import { lockedError } from "@/lib/billing/plans"
import { PlanLimitError } from "@/lib/billing/limits"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { normalizePhone } from "@/lib/contacts/phone"
import { contactInputSchema, upsertApiContact } from "@/lib/developer/api"
import { InsufficientBalanceError } from "@/lib/billing/messaging"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { findOrCreateConversation } from "@/lib/whatsapp/conversation"
import { sendAndRecord } from "@/lib/whatsapp/send"
import { buildTemplateMessage } from "@/lib/whatsapp/template-media"

export const runtime = "nodejs"

// Inbound automation hook for Zapier, Pabbly, Make or a Google Sheet:
//   POST { phone, name?, email?, tags?, attributes?, opted_in?, template?: { name, language?, variables? } }
// creates/updates the contact and (optionally) sends an approved template. The secret is the URL itself.
const schema = contactInputSchema.extend({
  phone: z.union([z.string(), z.number()]).transform(String),
  template: z.object({ name: z.string().min(1), language: z.string().optional(), variables: z.array(z.union([z.string(), z.number()]).transform(String)).max(20).optional() }).optional(),
})

async function hook(token: string) {
  const integration = await prisma.integration.findUnique({ where: { token } })
  return integration?.type === "INBOUND_HOOK" && integration.status === "ACTIVE" ? integration : null
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const integration = await hook((await params).token)
  if (!integration) return NextResponse.json({ error: "Unknown or disabled hook." }, { status: 404 })
  return NextResponse.json({ ok: true, name: integration.name, usage: "POST JSON: { phone, name, tags, attributes, template: { name, language, variables } }" })
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const integration = await hook((await params).token)
  if (!integration) return NextResponse.json({ error: "Unknown or disabled hook." }, { status: 404 })
  const organizationId = integration.organizationId
  if (!(await hasFeature(organizationId, "integrations")))
    return NextResponse.json({ ok: false, error: (await lockedError("integrations")).message }, { status: 402 })
  const fail = async (status: number, error: string) => {
    await prisma.integration.update({ where: { id: integration.id }, data: { lastEventAt: new Date(), lastError: error.slice(0, 300) } })
    return NextResponse.json({ ok: false, error }, { status })
  }
  try {
    const raw = await request.json()
    // Tools often send empty strings for unused fields — drop them.
    const cleaned = Object.fromEntries(Object.entries(raw || {}).filter(([, value]) => value !== "" && value !== null))
    const input = schema.parse(cleaned)
    const phone = normalizePhone(input.phone)
    if (!phone) return fail(422, "phone must be a mobile number with country code, e.g. 919876543210.")
    const { contact, created } = await upsertApiContact(organizationId, phone, input)
    let sent: string | null = null
    if (input.template) {
      const phoneNumber = await prisma.phoneNumber.findFirst({ where: { status: "CONNECTED", waba: { organizationId, status: "CONNECTED" } } })
      const templates = phoneNumber ? await prisma.template.findMany({ where: { organizationId, wabaId: phoneNumber.wabaId, status: "APPROVED", name: input.template.name,
        ...(input.template.language ? { language: input.template.language } : {}) } }) : []
      if (!phoneNumber) return fail(409, "Connect a WhatsApp number first.")
      if (templates.length !== 1) return fail(templates.length ? 422 : 404, templates.length ? `Template "${input.template.name}" exists in several languages — add template.language.` : `No approved template named "${input.template.name}".`)
      const template = templates[0]
      const needed = new Set([...(template.content || "").matchAll(/\{\{(\d+)\}\}/g)].map(match => match[1])).size
      const variables = (input.template.variables || []).map(value => value.trim()).filter(Boolean)
      if (variables.length < needed) return fail(422, `Template "${template.name}" needs ${needed} variable(s); got ${variables.length}.`)
      const token = await getMetaAccessToken(organizationId)
      if (!token) return fail(409, "Meta isn't connected.")
      const conversation = await findOrCreateConversation({ organizationId, phoneNumberId: phoneNumber.id, contactId: contact.id, reopen: false })
      const values = variables.slice(0, needed)
      sent = (await sendAndRecord({ accessToken: token, metaPhoneNumberId: phoneNumber.phoneNumberId, to: phone, conversationId: conversation.id },
        { type: "template", template: await buildTemplateMessage(template, values, { accessToken: token, metaPhoneNumberId: phoneNumber.phoneNumberId }) },
        (template.content || template.name).replace(/\{\{(\d+)\}\}/g, (match, number) => values[Number(number) - 1] ?? match),
        { source: "INBOUND_HOOK", integrationId: integration.id, templateId: template.id })) || null
    }
    await prisma.integration.update({ where: { id: integration.id }, data: { lastEventAt: new Date(), lastError: null } })
    return NextResponse.json({ ok: true, contact_id: contact.id, contact_created: created, whatsapp_message_id: sent })
  } catch (error) {
    if (error instanceof z.ZodError) return fail(422, `${error.issues[0]?.path.join(".")}: ${error.issues[0]?.message}`)
    if (error instanceof InsufficientBalanceError || error instanceof PlanLimitError) return fail(402, error.message)
    if (error instanceof SyntaxError) return fail(400, "Send a JSON body.")
    return fail(502, error instanceof Error ? error.message : "Failed")
  }
}
