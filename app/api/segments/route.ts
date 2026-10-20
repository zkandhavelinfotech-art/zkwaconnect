import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { contactWhere, describeFilters, parseFilters, segmentFiltersSchema } from "@/lib/contacts/filters"

const fail = (error: unknown) => NextResponse.json({
  error: error instanceof z.ZodError ? error.issues[0]?.message : (error as { code?: string }).code === "P2002" ? "A segment with that name already exists."
    : error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) })

async function campaignNames(organizationId: string, ids: string[]) {
  const rows = ids.length ? await prisma.campaign.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } }) : []
  return new Map(rows.map(row => [row.id, row.name]))
}

// Saved segments with live counts.
export async function GET() {
  try {
    const { organizationId } = await requireMember()
    const [segments, campaigns, attributeKeys, sources] = await Promise.all([
      prisma.segment.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
      prisma.campaign.findMany({ where: { organizationId, startedAt: { not: null } }, orderBy: { startedAt: "desc" }, take: 50, select: { id: true, name: true, startedAt: true } }),
      prisma.$queryRaw<{ key: string }[]>`
        SELECT DISTINCT key FROM contacts, jsonb_object_keys(CASE WHEN jsonb_typeof(metadata->'attributes') = 'object' THEN metadata->'attributes' ELSE '{}'::jsonb END) AS key
        WHERE "organizationId" = ${organizationId} ORDER BY key LIMIT 100`,
      prisma.contact.groupBy({ by: ["source"], where: { organizationId }, _count: { _all: true } }),
    ])
    const names = await campaignNames(organizationId, segments.map(segment => parseFilters(segment.filters).campaign?.id || "").filter(Boolean))
    const withCounts = await Promise.all(segments.map(async segment => {
      const filters = parseFilters(segment.filters)
      return { id: segment.id, name: segment.name, filters, updatedAt: segment.updatedAt,
        description: describeFilters(filters, filters.campaign ? names.get(filters.campaign.id) : undefined),
        count: await prisma.contact.count({ where: contactWhere(organizationId, filters) }),
        optedIn: await prisma.contact.count({ where: { AND: [contactWhere(organizationId, filters), { optedIn: true }] } }) }
    }))
    return NextResponse.json({ segments: withCounts, campaigns, attributeKeys: attributeKeys.map(row => row.key),
      sources: sources.map(row => row.source || "MANUAL").filter((value, index, all) => all.indexOf(value) === index) })
  } catch (error) { return fail(error) }
}

const saveSchema = z.object({ name: z.string().trim().min(2, "Name the segment.").max(60), filters: segmentFiltersSchema })

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const body = await request.json()
    if (body.preview) {
      const filters = segmentFiltersSchema.parse(body.filters || {})
      const where = contactWhere(organizationId, filters)
      const [count, optedIn, sample] = await Promise.all([
        prisma.contact.count({ where }),
        prisma.contact.count({ where: { AND: [where, { optedIn: true }] } }),
        prisma.contact.findMany({ where, take: 5, orderBy: { createdAt: "desc" }, select: { name: true, phone: true } }),
      ])
      return NextResponse.json({ count, optedIn, sample })
    }
    const input = saveSchema.parse(body)
    if (await prisma.segment.count({ where: { organizationId } }) >= 50) throw new Error("Up to 50 saved segments.")
    const segment = await prisma.segment.create({ data: { organizationId, name: input.name, filters: input.filters as Prisma.InputJsonValue } })
    return NextResponse.json({ segment, message: `Segment “${segment.name}” saved.` }, { status: 201 })
  } catch (error) { return fail(error) }
}

export async function PATCH(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const body = await request.json()
    const input = saveSchema.parse(body)
    const updated = await prisma.segment.updateMany({ where: { id: String(body.id || ""), organizationId }, data: { name: input.name, filters: input.filters as Prisma.InputJsonValue } })
    if (!updated.count) return NextResponse.json({ error: "Segment not found." }, { status: 404 })
    return NextResponse.json({ ok: true, message: "Segment updated." })
  } catch (error) { return fail(error) }
}

export async function DELETE(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const id = new URL(request.url).searchParams.get("id") || ""
    const inUse = await prisma.campaign.count({ where: { organizationId, segmentId: id, status: { in: ["DRAFT", "SCHEDULED", "STARTING"] } } })
    if (inUse) return NextResponse.json({ error: `${inUse} draft or scheduled broadcast(s) use this segment. Change their audience first.` }, { status: 409 })
    await prisma.segment.deleteMany({ where: { id, organizationId } })
    return NextResponse.json({ ok: true, message: "Segment deleted." })
  } catch (error) { return fail(error) }
}
