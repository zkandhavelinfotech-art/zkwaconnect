import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { businessCatalogs, commerceSettings, connectCatalog, connectedCatalog, updateCommerceSettings } from "@/lib/commerce/catalog"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: errorStatus(error) })

// Catalog + cart status for each connected WhatsApp account.
export async function GET() {
  try {
    const { organizationId } = await requireMember()
    const token = await getMetaAccessToken(organizationId)
    if (!token) return NextResponse.json({ error: "Connect Facebook first (Meta Account)." }, { status: 409 })
    const [wabas, connection] = await Promise.all([
      prisma.waba.findMany({ where: { organizationId, status: "CONNECTED" }, include: { phoneNumbers: { where: { status: "CONNECTED" } } } }),
      prisma.metaConnection.findFirst({ where: { organizationId, status: "CONNECTED" }, orderBy: { updatedAt: "desc" }, select: { businessManagerId: true } }),
    ])
    const available = connection?.businessManagerId ? await businessCatalogs(connection.businessManagerId, token).catch(error => ({ error: (error as Error).message })) : []
    const accounts = await Promise.all(wabas.map(async waba => ({
      id: waba.id, wabaId: waba.wabaId, name: waba.name,
      catalog: await connectedCatalog(waba.wabaId, token).catch(error => ({ error: (error as Error).message })),
      phones: await Promise.all(waba.phoneNumbers.map(async phone => ({ id: phone.id, phoneNumber: phone.phoneNumber, displayName: phone.displayName,
        settings: await commerceSettings(phone.phoneNumberId, token).catch(error => ({ error: (error as Error).message })) }))),
    })))
    return NextResponse.json({ accounts, catalogs: Array.isArray(available) ? available : [], catalogsError: Array.isArray(available) ? null : available.error })
  } catch (error) { return fail(error) }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), wabaId: z.string().min(1), catalogId: z.string().regex(/^\d+$/, "Pick a catalog.") }),
  z.object({ action: z.literal("settings"), phoneId: z.string().min(1), cartEnabled: z.boolean(), catalogVisible: z.boolean() }),
])

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const token = await getMetaAccessToken(organizationId)
    if (!token) return NextResponse.json({ error: "Connect Facebook first." }, { status: 409 })
    const input = schema.parse(await request.json())
    if (input.action === "connect") {
      const waba = await prisma.waba.findFirst({ where: { id: input.wabaId, organizationId } })
      if (!waba) return NextResponse.json({ error: "WhatsApp account not found." }, { status: 404 })
      await connectCatalog(waba.wabaId, input.catalogId, token)
      return NextResponse.json({ ok: true, message: "Catalog connected. Turn on the cart and catalog for your number below." })
    }
    const phone = await prisma.phoneNumber.findFirst({ where: { id: input.phoneId, waba: { organizationId } } })
    if (!phone) return NextResponse.json({ error: "Phone number not found." }, { status: 404 })
    await updateCommerceSettings(phone.phoneNumberId, token, input)
    return NextResponse.json({ ok: true, message: "Shopping settings updated on WhatsApp." })
  } catch (error) { return fail(error) }
}
