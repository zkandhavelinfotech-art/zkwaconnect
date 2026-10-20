import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"

const tag = z.string().trim().min(1).max(40)

// A saved segment: every rule must match (AND). Shared by Contacts, export and broadcast audiences.
export const segmentFiltersSchema = z.object({
  tagsAny: z.array(tag).max(20).default([]),
  tagsAll: z.array(tag).max(20).default([]),
  tagsNone: z.array(tag).max(20).default([]),
  consent: z.enum(["ALL", "OPTED_IN", "NOT_OPTED_IN"]).default("ALL"),
  sources: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  addedWithinDays: z.number().int().min(1).max(3650).nullable().default(null),
  messagedWithinDays: z.number().int().min(1).max(3650).nullable().default(null),
  attributes: z.array(z.object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, "Custom field names use lowercase letters, numbers and _."),
    op: z.enum(["equals", "contains", "exists", "missing"]),
    value: z.string().trim().max(200).default(""),
  })).max(10).default([]),
  campaign: z.object({
    id: z.string().min(1),
    status: z.enum(["received", "delivered", "read", "not_read", "replied", "clicked", "not_clicked", "failed"]),
  }).nullable().default(null),
})
export type SegmentFilters = z.infer<typeof segmentFiltersSchema>

export function parseFilters(value: unknown): SegmentFilters {
  const parsed = segmentFiltersSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : segmentFiltersSchema.parse({})
}

const RECIPIENT: Record<NonNullable<SegmentFilters["campaign"]>["status"], Prisma.CampaignRecipientWhereInput> = {
  received: { status: { in: ["SENT", "DELIVERED", "READ"] } },
  delivered: { status: { in: ["DELIVERED", "READ"] } },
  read: { status: "READ" },
  not_read: { status: { in: ["SENT", "DELIVERED"] } },
  replied: { repliedAt: { not: null } },
  clicked: { clickedAt: { not: null } },
  not_clicked: { status: { in: ["SENT", "DELIVERED", "READ"] }, clickedAt: null },
  failed: { status: "FAILED" },
}

export function contactWhere(organizationId: string, filters: SegmentFilters): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = []
  if (filters.tagsAny.length) and.push({ OR: filters.tagsAny.map(item => ({ tags: { array_contains: [item] } })) })
  for (const item of filters.tagsAll) and.push({ tags: { array_contains: [item] } })
  // Contacts with no tags at all (NULL) also "don't have" the tag.
  for (const item of filters.tagsNone) and.push({ OR: [{ tags: { equals: Prisma.AnyNull } }, { NOT: { tags: { array_contains: [item] } } }] })
  if (filters.consent === "OPTED_IN") and.push({ optedIn: true })
  if (filters.consent === "NOT_OPTED_IN") and.push({ optedIn: false })
  if (filters.sources.length) and.push({ OR: filters.sources.map(source => source === "MANUAL" ? { OR: [{ source: null }, { source: "MANUAL" }] } : { source }) })
  if (filters.addedWithinDays) and.push({ createdAt: { gte: new Date(Date.now() - filters.addedWithinDays * 86_400_000) } })
  if (filters.messagedWithinDays) and.push({ conversations: { some: { messages: { some: { direction: "INBOUND",
    createdAt: { gte: new Date(Date.now() - filters.messagedWithinDays * 86_400_000) } } } } } })
  for (const rule of filters.attributes) {
    const path = ["attributes", rule.key]
    if (rule.op === "equals") and.push({ metadata: { path, equals: rule.value } })
    if (rule.op === "contains") and.push({ metadata: { path, string_contains: rule.value } })
    if (rule.op === "exists") and.push({ NOT: { OR: [{ metadata: { path, equals: Prisma.AnyNull } }, { metadata: { path, equals: "" } }] } })
    if (rule.op === "missing") and.push({ OR: [{ metadata: { path, equals: Prisma.AnyNull } }, { metadata: { path, equals: "" } }] })
  }
  if (filters.campaign) and.push({ campaignRecipients: { some: { campaignId: filters.campaign.id, ...RECIPIENT[filters.campaign.status] } } })
  return { organizationId, AND: and }
}

export async function segmentWhere(organizationId: string, segmentId: string) {
  const segment = await prisma.segment.findFirst({ where: { id: segmentId, organizationId } })
  if (!segment) throw Object.assign(new Error("That saved segment no longer exists."), { status: 404 })
  return contactWhere(organizationId, parseFilters(segment.filters))
}

// One line per rule, for showing a segment in the UI.
export function describeFilters(filters: SegmentFilters, campaignName?: string) {
  const parts: string[] = []
  if (filters.tagsAny.length) parts.push(`tag is any of ${filters.tagsAny.join(", ")}`)
  if (filters.tagsAll.length) parts.push(`has all tags ${filters.tagsAll.join(", ")}`)
  if (filters.tagsNone.length) parts.push(`doesn't have ${filters.tagsNone.join(", ")}`)
  if (filters.consent !== "ALL") parts.push(filters.consent === "OPTED_IN" ? "opted in" : "not opted in")
  if (filters.sources.length) parts.push(`source: ${filters.sources.join(", ").toLowerCase()}`)
  if (filters.addedWithinDays) parts.push(`added in last ${filters.addedWithinDays} days`)
  if (filters.messagedWithinDays) parts.push(`messaged you in last ${filters.messagedWithinDays} days`)
  for (const rule of filters.attributes) parts.push(rule.op === "exists" ? `${rule.key} is set` : rule.op === "missing" ? `${rule.key} is empty` : `${rule.key} ${rule.op === "equals" ? "=" : "contains"} “${rule.value}”`)
  if (filters.campaign) parts.push(`${filters.campaign.status.replace("_", " ")} broadcast “${campaignName || "…"}”`)
  return parts.length ? parts.join(" · ") : "All contacts"
}
