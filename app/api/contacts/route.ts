import { NextResponse } from "next/server"
import { segmentWhere } from "@/lib/contacts/filters"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { normalizePhone } from "@/lib/contacts/phone"

async function getOrganizationId() {
  const session = await getSession()
  return session?.user.memberships.find(item => item.status === "ACTIVE")?.organizationId || null
}

const tagSchema = z.string().trim().min(1).max(40)

function buildWhere(organizationId: string, params: URLSearchParams): Prisma.ContactWhereInput {
  const query = (params.get("q") || "").trim()
  const consent = params.get("consent") || "ALL"
  const source = params.get("source") || "ALL"
  const tag = (params.get("tag") || "").trim()
  const days = Number(params.get("added") || 0)
  const and: Prisma.ContactWhereInput[] = []
  if (consent === "OPTED_IN") and.push({ optedIn:true })
  if (consent === "NOT_OPTED_IN") and.push({ optedIn:false })
  if (source === "MANUAL") and.push({ OR:[{ source:null }, { source:"MANUAL" }] })
  else if (source !== "ALL") and.push({ source })
  if (tag === "__untagged") and.push({ OR:[{ tags:{ equals:Prisma.DbNull } }, { tags:{ equals:[] } }] })
  else if (tag) and.push({ tags:{ array_contains:[tag] } })
  if (days > 0) and.push({ createdAt:{ gte:new Date(Date.now() - days * 86_400_000) } })
  if (query) and.push({ OR:[
    { name:{ contains:query, mode:"insensitive" } },
    { email:{ contains:query, mode:"insensitive" } },
    { phone:{ contains:query.replace(/\D/g, "") || query } },
  ] })
  return { organizationId, AND:and }
}

function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value)
  // Prefix formula-like values so spreadsheets don't execute them.
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function attributesOf(metadata: Prisma.JsonValue) {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>).attributes : null
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function GET(request: Request) {
  try {
    const organizationId = await getOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const url = new URL(request.url)
    const segmentId = url.searchParams.get("segment")
    const where: Prisma.ContactWhereInput = segmentId
      ? { AND:[buildWhere(organizationId, url.searchParams), await segmentWhere(organizationId, segmentId)] }
      : buildWhere(organizationId, url.searchParams)

    if (url.searchParams.get("format") === "csv") {
      // All matching contacts (in pages of 2,000), with one column per custom field.
      const rows: { name:string|null; phone:string; email:string|null; source:string|null; tags:Prisma.JsonValue; metadata:Prisma.JsonValue; optedIn:boolean; createdAt:Date; id:string }[] = []
      for (let cursor: string | undefined; ;) {
        const batch = await prisma.contact.findMany({ where, orderBy:{ id:"asc" }, take:2000, ...(cursor ? { cursor:{ id:cursor }, skip:1 } : {}),
          select:{ id:true, name:true, phone:true, email:true, source:true, tags:true, metadata:true, optedIn:true, createdAt:true } })
        rows.push(...batch)
        if (batch.length < 2000 || rows.length >= 200000) break
        cursor = batch[batch.length - 1].id
      }
      const keys = [...new Set(rows.flatMap(row => Object.keys(attributesOf(row.metadata))))].sort()
      const lines = [["name","phone","email","tags","source","opted_in","added",...keys].join(","),
        ...rows.map(row => { const attributes = attributesOf(row.metadata)
          return [row.name, row.phone, row.email, Array.isArray(row.tags) ? row.tags.join("|") : "", row.source || "MANUAL",
            row.optedIn ? "yes" : "no", row.createdAt.toISOString().slice(0, 10), ...keys.map(key => attributes[key] ?? "")].map(csvCell).join(",") })]
      const label = segmentId ? (await prisma.segment.findFirst({ where:{ id:segmentId, organizationId }, select:{ name:true } }))?.name.replace(/[^\w-]+/g, "_") : ""
      return new Response("\uFEFF" + lines.join("\r\n"), { headers:{ "Content-Type":"text/csv; charset=utf-8", "Cache-Control":"private, no-store",
        "Content-Disposition":`attachment; filename="contacts-${label ? `${label}-` : ""}${new Date().toISOString().slice(0, 10)}.csv"` } })
    }

    const page = Math.max(1, Number(url.searchParams.get("page") || 1))
    const pageSize = 50
    const [contacts, total, tags, optedInTotal] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: { id:true, name:true, phone:true, email:true, source:true, tags:true, metadata:true, optedIn:true, createdAt:true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contact.count({ where }),
      prisma.$queryRaw<{ tag:string; count:number }[]>`
        SELECT tag, COUNT(*)::int AS count
        FROM contacts, jsonb_array_elements_text(CASE WHEN jsonb_typeof(tags) = 'array' THEN tags ELSE '[]'::jsonb END) AS tag
        WHERE "organizationId" = ${organizationId}
        GROUP BY tag ORDER BY count DESC, tag ASC LIMIT 200`,
      prisma.contact.count({ where:{ organizationId, optedIn:true } }),
    ])
    return NextResponse.json({ contacts, total, page, pages: Math.max(1, Math.ceil(total / pageSize)), tags, optedInTotal })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load contacts." }, { status: 500 })
  }
}

const contactInput = z.object({
  phone: z.string().trim().min(6).max(24),
  name: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  tags: z.array(tagSchema).max(20).optional().default([]),
})

const postSchema = z.discriminatedUnion("action", [
  z.object({ action:z.literal("create"), contact:contactInput, optedIn:z.boolean(), countryCode:z.string().regex(/^\d{1,4}$/).default("91") }),
  z.object({ action:z.literal("import"), contacts:z.array(contactInput).min(1).max(5000), tags:z.array(tagSchema).max(10).default([]),
    optedIn:z.boolean(), countryCode:z.string().regex(/^\d{1,4}$/).default("91") }),
])

export async function POST(request: Request) {
  try {
    const organizationId = await getOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const input = postSchema.parse(await request.json())
    const rows = input.action === "create" ? [input.contact] : input.contacts
    const extraTags = input.action === "import" ? input.tags : []

    const invalid: string[] = []
    const byPhone = new Map<string, { phone:string; name:string; email:string|null; tags:string[] }>()
    for (const row of rows) {
      const phone = normalizePhone(row.phone, input.countryCode)
      if (!phone) { invalid.push(row.phone); continue }
      const email = row.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) ? row.email : null
      const prior = byPhone.get(phone)
      byPhone.set(phone, { phone, name:row.name || prior?.name || "", email:email || prior?.email || null,
        tags:[...new Set([...(prior?.tags || []), ...row.tags, ...extraTags])] })
    }
    const prepared = [...byPhone.values()]
    const existing = await prisma.contact.findMany({ where:{ organizationId, phone:{ in:prepared.map(row => row.phone) } },
      select:{ id:true, phone:true, tags:true } })
    const existingByPhone = new Map(existing.map(contact => [contact.phone, contact]))
    const fresh = prepared.filter(row => !existingByPhone.has(row.phone))
    const created = fresh.length ? (await prisma.contact.createMany({ skipDuplicates:true, data:fresh.map(row => ({
      organizationId, phone:row.phone, name:row.name || null, email:row.email, tags:row.tags,
      source: input.action === "import" ? "CSV_IMPORT" : "MANUAL", optedIn:input.optedIn })) })).count : 0
    const updates = prepared.filter(row => existingByPhone.has(row.phone)).map(row => {
      const contact = existingByPhone.get(row.phone)!
      const current = Array.isArray(contact.tags) ? contact.tags.filter((tag): tag is string => typeof tag === "string") : []
      return prisma.contact.update({ where:{ id:contact.id }, data:{ tags:[...new Set([...current, ...row.tags])],
        ...(row.name ? { name:row.name } : {}), ...(row.email ? { email:row.email } : {}), ...(input.optedIn ? { optedIn:true } : {}) } })
    })
    for (let offset = 0; offset < updates.length; offset += 200) await prisma.$transaction(updates.slice(offset, offset + 200))
    const updated = updates.length
    if (input.action === "create" && invalid.length)
      return NextResponse.json({ error:"Enter a valid mobile number with country code, e.g. 919876543210." }, { status:400 })
    return NextResponse.json({ created, updated, invalid:invalid.slice(0, 20), invalidCount:invalid.length,
      message: input.action === "create" ? (created ? "Contact added." : "Contact updated.")
        : `${created} added, ${updated} updated${invalid.length ? `, ${invalid.length} skipped (invalid number)` : ""}.` }, { status:201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save contacts." }, { status: 400 })
  }
}

const patchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
  action: z.enum(["addTag", "removeTag", "optIn", "optOut", "delete"]),
  tag: tagSchema.optional(),
})

export async function PATCH(request: Request) {
  try {
    const organizationId = await getOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { ids, action, tag } = patchSchema.parse(await request.json())
    const where = { organizationId, id:{ in:ids } }

    if (action === "optIn" || action === "optOut") {
      const result = await prisma.contact.updateMany({ where, data:{ optedIn: action === "optIn" } })
      return NextResponse.json({ message:`${result.count} contact(s) updated.` })
    }
    if (action === "delete") {
      // Contacts with chat history are kept so conversations stay intact.
      const result = await prisma.contact.deleteMany({ where:{ ...where, conversations:{ none:{} } } })
      const kept = ids.length - result.count
      return NextResponse.json({ message:`${result.count} contact(s) deleted.${kept ? ` ${kept} with chat history were kept — opt them out instead.` : ""}` })
    }
    if (!tag) return NextResponse.json({ error:"Enter a tag." }, { status:400 })
    const contacts = await prisma.contact.findMany({ where, select:{ id:true, tags:true } })
    await prisma.$transaction(contacts.map(contact => {
      const current = Array.isArray(contact.tags) ? contact.tags.filter((item): item is string => typeof item === "string") : []
      const tags = action === "addTag" ? [...new Set([...current, tag])] : current.filter(item => item !== tag)
      return prisma.contact.update({ where:{ id:contact.id }, data:{ tags } })
    }))
    return NextResponse.json({ message:`Tag “${tag}” ${action === "addTag" ? "added to" : "removed from"} ${contacts.length} contact(s).` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update contacts." }, { status: 400 })
  }
}
