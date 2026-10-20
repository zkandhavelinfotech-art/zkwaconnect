import { NextResponse } from "next/server"
import { assertFeature, PlanLimitError } from "@/lib/billing/limits"
import { FeatureLockedError } from "@/lib/billing/plans"
import { InsufficientBalanceError } from "@/lib/billing/messaging"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { MetaApiError } from "@/lib/meta/graph"
import { ApiError, authenticateApiKey } from "./keys"
import { emitEvent } from "./webhooks"

type Context = { organizationId: string; keyId: string }

// Wraps a public API handler: key auth, consistent { error: { code, message } } responses.
export function apiHandler<P>(handler: (request: Request, context: Context, params: P) => Promise<Response>) {
  return async (request: Request, route: { params: Promise<P> }) => {
    try {
      const context = await authenticateApiKey(request)
      await assertFeature(context.organizationId, "api")
      return await handler(request, context, await route.params)
    } catch (error) {
      if (error instanceof ApiError) return apiError(error.status, error.code, error.message)
      if (error instanceof PlanLimitError) return apiError(402, `plan_${error.reason}`, error.message)
      if (error instanceof FeatureLockedError) return apiError(402, "plan_feature", error.message, { feature: error.feature })
      if (error instanceof InsufficientBalanceError) return apiError(402, "insufficient_balance", error.message, { needed: error.needed, balance: error.balance })
      if (error instanceof z.ZodError) {
        const issue = error.issues[0]
        return apiError(422, "invalid_request", `${issue?.path.join(".") || "body"}: ${issue?.message}`)
      }
      if (error instanceof MetaApiError)
        return apiError(502, "whatsapp_error", `WhatsApp rejected the request: ${error.message}${error.code ? ` (code ${error.code})` : ""}`, { whatsapp_code: error.code })
      if (error instanceof SyntaxError) return apiError(400, "invalid_json", "The request body is not valid JSON.")
      console.error("[api v1]", error)
      return apiError(500, "server_error", "Something went wrong on our side. Try again.")
    }
  }
}

export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status })
}

export const contactInputSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  attributes: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/i, "attribute names: letters, numbers, _"), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
  opted_in: z.boolean().optional(),
})

// Create or update a contact from API input. Tags are added (not replaced); attributes are merged.
export async function upsertApiContact(organizationId: string, phone: string, input: z.infer<typeof contactInputSchema>) {
  const existing = await prisma.contact.findUnique({ where: { organizationId_phone: { organizationId, phone } } })
  const metadata = (existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {}) as Record<string, unknown>
  const attributes = { ...(metadata.attributes as Record<string, unknown> || {}), ...Object.fromEntries(Object.entries(input.attributes || {}).map(([key, value]) => [key.toLowerCase(), String(value)])) }
  const tags = [...new Set([...(Array.isArray(existing?.tags) ? existing!.tags.filter((tag): tag is string => typeof tag === "string") : []), ...(input.tags || [])])]
  const data = {
    ...(input.name ? { name: input.name } : {}), ...(input.email ? { email: input.email } : {}),
    tags, metadata: { ...metadata, attributes } as Prisma.InputJsonValue,
    ...(input.opted_in !== undefined ? { optedIn: input.opted_in } : {}),
  }
  const contact = existing
    ? await prisma.contact.update({ where: { id: existing.id }, data })
    : await prisma.contact.create({ data: { organizationId, phone, source: "API", optedIn: input.opted_in ?? true, ...data } })
  if (!existing) await emitEvent(organizationId, "contact.created", { contact: { id: contact.id, phone, name: contact.name, source: "API" } })
  return { contact, created: !existing }
}

export function contactJson(contact: { id: string; phone: string; name: string | null; email: string | null; tags: Prisma.JsonValue; metadata: Prisma.JsonValue
  optedIn: boolean; source: string | null; createdAt: Date }) {
  const metadata = (contact.metadata && typeof contact.metadata === "object" && !Array.isArray(contact.metadata) ? contact.metadata : {}) as Record<string, unknown>
  return { id: contact.id, phone: contact.phone, name: contact.name, email: contact.email, tags: Array.isArray(contact.tags) ? contact.tags : [],
    attributes: metadata.attributes || {}, opted_in: contact.optedIn, source: contact.source, created_at: contact.createdAt }
}
