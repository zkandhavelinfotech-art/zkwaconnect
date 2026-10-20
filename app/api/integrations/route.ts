import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { newSecret } from "@/lib/developer/webhooks"
import { AUTOMATIONS, connectStore, disconnectStore, openSecrets, ORDER_FIELDS, readConfig, sealSecrets, shopDomainOf, storeConfigSchema } from "@/lib/integrations/store"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: errorStatus(error) })
const baseUrl = (request: Request) => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "")

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const [integrations, templates, phones, sheets, recentCarts] = await Promise.all([
      prisma.integration.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
      prisma.template.findMany({ where: { organizationId, status: "APPROVED" }, select: { id: true, name: true, language: true, category: true, content: true, components: true }, orderBy: { name: "asc" } }),
      prisma.phoneNumber.findMany({ where: { status: "CONNECTED", waba: { organizationId } }, select: { id: true, phoneNumber: true, displayName: true } }),
      prisma.webhookEndpoint.findMany({ where: { organizationId, url: { startsWith: "https://script.google.com/" } }, select: { id: true, url: true, events: true, active: true, lastDeliveryAt: true, lastError: true, failureCount: true } }),
      prisma.order.groupBy({ by: ["integrationId", "status"], where: { organizationId, integrationId: { not: null }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true } }),
    ])
    const base = baseUrl(request)
    return NextResponse.json({
      integrations: integrations.map(item => ({ id: item.id, type: item.type, name: item.name, status: item.status, config: readConfig(item.config), lastEventAt: item.lastEventAt,
        lastError: item.lastError, createdAt: item.createdAt,
        url: item.type === "INBOUND_HOOK" ? `${base}/api/hooks/${item.token}` : `${base}/api/integrations/${item.id}/webhook`,
        stats: Object.fromEntries(recentCarts.filter(row => row.integrationId === item.id).map(row => [row.status, row._count._all])) })),
      templates: templates.map(template => ({ ...template, variables: new Set([...(template.content || "").matchAll(/\{\{(\d+)\}\}/g)].map(match => match[1])).size,
        quickReplies: ((Array.isArray(template.components) ? template.components : []) as { type?: string; buttons?: { type?: string }[] }[])
          .find(component => component.type?.toUpperCase() === "BUTTONS")?.buttons?.filter(button => button.type?.toUpperCase() === "QUICK_REPLY").length || 0, components: undefined })),
      phones, sheets: sheets.map(sheet => ({ ...sheet, url: sheet.url.replace(/token=[^&]+/, "token=…") })),
      automations: AUTOMATIONS, fields: ORDER_FIELDS, publicBase: base,
    })
  } catch (error) { return fail(error) }
}

const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SHOPIFY"), shopDomain: z.string().min(3), accessToken: z.string().trim().regex(/^shpat_[\w]+$/, "Admin API access token starts with shpat_."),
    apiSecret: z.string().trim().min(10, "Paste the app's API secret key.") }),
  z.object({ type: z.literal("WOOCOMMERCE"), siteUrl: z.string().trim().url().startsWith("https://", "Your store must use https://."),
    consumerKey: z.string().trim().regex(/^ck_\w+$/, "Consumer key starts with ck_."), consumerSecret: z.string().trim().regex(/^cs_\w+$/, "Consumer secret starts with cs_.") }),
  z.object({ type: z.literal("INBOUND_HOOK"), name: z.string().trim().min(2).max(60) }),
  z.object({ type: z.literal("SHEETS"), webAppUrl: z.string().trim().regex(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/, "Paste the Web app URL (https://script.google.com/macros/s/…/exec)."),
    token: z.string().regex(/^[\w-]{20,64}$/), events: z.array(z.string()).min(1, "Pick at least one thing to log.") }),
])

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const input = createSchema.parse(await request.json())
    if (input.type === "INBOUND_HOOK") {
      const created = await prisma.integration.create({ data: { organizationId, type: "INBOUND_HOOK", name: input.name, config: {}, token: crypto.randomBytes(24).toString("base64url") } })
      return NextResponse.json({ id: created.id, message: "Hook created. Copy its URL into Zapier, Pabbly, Make or your Google Sheet script." }, { status: 201 })
    }
    if (input.type === "SHEETS") {
      await prisma.webhookEndpoint.create({ data: { organizationId, url: `${input.webAppUrl}?token=${input.token}`, secret: newSecret(), events: input.events, description: "Google Sheets" } })
      return NextResponse.json({ ok: true, message: "Google Sheet connected. New events appear as rows within a few seconds." }, { status: 201 })
    }
    if (await prisma.integration.count({ where: { organizationId, type: { in: ["SHOPIFY", "WOOCOMMERCE"] } } }) >= 5) throw new Error("Up to 5 connected stores.")
    const config = storeConfigSchema.parse(input.type === "SHOPIFY" ? { shopDomain: shopDomainOf(input.shopDomain) || "" } : { siteUrl: input.siteUrl.replace(/\/$/, "") })
    if (input.type === "SHOPIFY" && !config.shopDomain) throw new Error("Enter your store's myshopify.com address, e.g. my-store.myshopify.com.")
    const secrets = input.type === "SHOPIFY" ? { accessToken: input.accessToken, apiSecret: input.apiSecret, webhookSecret: "" }
      : { consumerKey: input.consumerKey, consumerSecret: input.consumerSecret, webhookSecret: crypto.randomBytes(24).toString("base64url") }
    const integration = await prisma.integration.create({ data: { organizationId, type: input.type, name: config.shopDomain || config.siteUrl || input.type, config: config as Prisma.InputJsonValue,
      secretEncrypted: sealSecrets(secrets), status: "ACTIVE" } })
    try {
      const result = await connectStore(input.type, config, secrets, `${baseUrl(request)}/api/integrations/${integration.id}/webhook`)
      await prisma.integration.update({ where: { id: integration.id }, data: { name: result.storeName,
        config: { ...config, storeName: result.storeName, webhookIds: result.webhookIds, webhookError: result.webhookError } as Prisma.InputJsonValue } })
      return NextResponse.json({ id: integration.id, message: result.webhookError ? `Connected to ${result.storeName}, but store events aren't set up yet: ${result.webhookError}`
        : `Connected to ${result.storeName}. Now pick templates for the automations below.` }, { status: 201 })
    } catch (error) {
      await prisma.integration.delete({ where: { id: integration.id } })
      throw new Error(`Couldn't connect to the store: ${(error as Error).message}. Check the address and credentials.`)
    }
  } catch (error) { return fail(error) }
}

export async function PATCH(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const body = await request.json()
    const integration = await prisma.integration.findFirst({ where: { id: String(body.id || ""), organizationId } })
    if (!integration) return NextResponse.json({ error: "Integration not found." }, { status: 404 })
    const current = readConfig(integration.config)
    const patch = z.object({ status: z.enum(["ACTIVE", "PAUSED"]).optional(), automations: storeConfigSchema.shape.automations.optional(),
      phoneNumberId: z.string().optional(), countryCode: z.string().regex(/^\d{1,4}$/).optional(), abandonedNeedsConsent: z.boolean().optional() }).parse(body)
    for (const [key, automation] of Object.entries(patch.automations || {}))
      if (automation?.enabled && !automation.templateId) throw new Error(`Pick a template for “${AUTOMATIONS[key as keyof typeof AUTOMATIONS].label}” or turn it off.`)
    await prisma.integration.update({ where: { id: integration.id }, data: { ...(patch.status ? { status: patch.status } : {}), lastError: null,
      config: { ...current, ...(patch.automations ? { automations: patch.automations } : {}), ...(patch.phoneNumberId !== undefined ? { phoneNumberId: patch.phoneNumberId || undefined } : {}),
        ...(patch.countryCode ? { countryCode: patch.countryCode } : {}), ...(patch.abandonedNeedsConsent !== undefined ? { abandonedNeedsConsent: patch.abandonedNeedsConsent } : {}) } as Prisma.InputJsonValue } })
    return NextResponse.json({ ok: true, message: "Saved." })
  } catch (error) { return fail(error) }
}

export async function DELETE(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const url = new URL(request.url)
    if (url.searchParams.get("sheet")) {
      await prisma.webhookEndpoint.deleteMany({ where: { id: url.searchParams.get("sheet")!, organizationId, url: { startsWith: "https://script.google.com/" } } })
      return NextResponse.json({ ok: true, message: "Google Sheet disconnected." })
    }
    const integration = await prisma.integration.findFirst({ where: { id: url.searchParams.get("id") || "", organizationId } })
    if (!integration) return NextResponse.json({ error: "Integration not found." }, { status: 404 })
    if (integration.type !== "INBOUND_HOOK") await disconnectStore(integration.type, readConfig(integration.config), openSecrets(integration.secretEncrypted)).catch(() => null)
    await prisma.integration.delete({ where: { id: integration.id } })
    return NextResponse.json({ ok: true, message: "Disconnected." })
  } catch (error) { return fail(error) }
}
