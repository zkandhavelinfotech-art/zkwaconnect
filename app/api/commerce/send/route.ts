import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { catalogForPhone, catalogMessage, productMessage } from "@/lib/commerce/catalog"
import { serviceWindowOpen } from "@/lib/billing/messaging"
import { sendAndRecord } from "@/lib/whatsapp/send"

const schema = z.object({
  conversationId: z.string().min(1),
  kind: z.enum(["products", "catalog"]),
  retailerIds: z.array(z.string().min(1)).max(30).default([]),
  header: z.string().trim().max(60).optional(), body: z.string().trim().max(1024).optional(),
})

// Send one product, a product list (up to 30) or the whole catalog into a WhatsApp chat (needs the 24-hour window).
export async function POST(request: Request) {
  try {
    const { organizationId, userId } = await requireMember()
    const input = schema.parse(await request.json())
    const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, organizationId }, include: { contact: true, phoneNumber: true } })
    if (!conversation?.phoneNumber) return NextResponse.json({ error: "Products can be sent in WhatsApp chats." }, { status: 400 })
    if (!(await serviceWindowOpen(conversation.id))) return NextResponse.json({ error: "The 24-hour reply window is closed. Send a template first." }, { status: 409 })
    if (input.kind === "products" && !input.retailerIds.length) return NextResponse.json({ error: "Pick at least one product." }, { status: 400 })
    const token = await getMetaAccessToken(organizationId)
    if (!token) return NextResponse.json({ error: "Connect Meta first." }, { status: 409 })
    const catalog = await catalogForPhone(conversation.phoneNumber.id, token)
    if (!catalog) return NextResponse.json({ error: "Connect a product catalog first (Commerce → Catalog)." }, { status: 409 })
    const payload = input.kind === "catalog" ? catalogMessage(input.body || "Browse our catalog 🛍️", input.retailerIds[0]) : productMessage(catalog.id, input.retailerIds, input)
    const count = input.retailerIds.length
    const summary = input.kind === "catalog" ? `🛍️ Catalog: ${input.body || "Browse our catalog"}` : `🛍️ ${count} product${count === 1 ? "" : "s"}${input.body ? `: ${input.body}` : ""}`
    await sendAndRecord({ accessToken: token, metaPhoneNumberId: conversation.phoneNumber.phoneNumberId, to: conversation.contact.phone, conversationId: conversation.id, senderUserId: userId },
      payload, summary, { source: "INBOX", products: input.retailerIds })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) })
  }
}
