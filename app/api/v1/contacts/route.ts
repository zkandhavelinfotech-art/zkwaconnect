import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { normalizePhone } from "@/lib/contacts/phone"
import { apiError, apiHandler, contactInputSchema, contactJson, upsertApiContact } from "@/lib/developer/api"

const PAGE_SIZE = 100

// GET /api/v1/contacts?phone=…  or  ?tag=…&page=1 — look up or list contacts.
export const GET = apiHandler(async (request, { organizationId }) => {
  const url = new URL(request.url)
  const rawPhone = url.searchParams.get("phone")
  if (rawPhone) {
    const phone = normalizePhone(rawPhone)
    const contact = phone ? await prisma.contact.findUnique({ where: { organizationId_phone: { organizationId, phone } } }) : null
    if (!contact) return apiError(404, "not_found", "No contact with that phone number.")
    return NextResponse.json(contactJson(contact))
  }
  const tag = url.searchParams.get("tag")
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
  const where = { organizationId, ...(tag ? { tags: { array_contains: [tag] } } : {}) }
  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ])
  return NextResponse.json({ data: contacts.map(contactJson), page, page_size: PAGE_SIZE, total })
})

// POST /api/v1/contacts — create or update by phone. Tags are added; attributes are merged.
export const POST = apiHandler(async (request, { organizationId }) => {
  const body = await request.json()
  const phone = normalizePhone(String(body?.phone || ""))
  if (!phone) return apiError(422, "invalid_phone", "`phone` must be a phone number with country code, e.g. 919876543210.")
  const { contact, created } = await upsertApiContact(organizationId, phone, contactInputSchema.parse(body))
  return NextResponse.json(contactJson(contact), { status: created ? 201 : 200 })
})
