import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { pageAllowance, pageStats, poweredByFor, publishPage, sectionsSchema, slugSchema, themeSchema } from "@/lib/pages/pages"

type Context = { params: Promise<{ id: string }> }
const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? `${error.issues[0]?.path.join(" › ") || ""} ${error.issues[0]?.message}`.trim() : error instanceof Error ? error.message : "Request failed" },
  { status: errorStatus(error) })

async function own(organizationId: string, id: string) {
  const page = await prisma.sitePage.findFirst({ where: { id, organizationId } })
  if (!page) throw Object.assign(new Error("Page not found."), { status: 404 })
  return page
}

// Editor data: the draft, numbers it can use, footer line and stats.
export async function GET(_request: Request, { params }: Context) {
  try {
    const { organizationId } = await requireMember()
    const { id } = await params
    const page = await own(organizationId, id)
    const numbers = await prisma.phoneNumber.findMany({ where: { status: "CONNECTED", waba: { organizationId } }, select: { phoneNumber: true, displayName: true } })
    return NextResponse.json({ page, numbers: numbers.map(number => ({ value: number.phoneNumber.replace(/\D/g, ""), label: `${number.displayName || "WhatsApp"} · ${number.phoneNumber}` })),
      poweredBy: await poweredByFor(organizationId), stats: (await pageStats(organizationId, [id]))[id], allowance: await pageAllowance(organizationId),
      base: (process.env.APP_URL || "").replace(/\/+$/, "") })
  } catch (error) { return fail(error) }
}

const draftSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  slug: slugSchema.optional(),
  whatsappNumber: z.string().trim().regex(/^\+?\d{10,15}$/, "WhatsApp number must have 10–15 digits with country code").or(z.literal("")).optional(),
  seoTitle: z.string().trim().max(120).optional(), seoDescription: z.string().trim().max(300).optional(),
  theme: themeSchema.optional(), sections: sectionsSchema.optional(),
})

// Autosave of the draft (published pages change only when you publish again).
export async function PUT(request: Request, { params }: Context) {
  try {
    const { organizationId } = await requireMember()
    const { id } = await params
    const page = await own(organizationId, id)
    const input = draftSchema.parse(await request.json())
    if (input.slug && input.slug !== page.slug && await prisma.sitePage.findUnique({ where: { slug: input.slug } })) throw new Error("That address is taken — choose another.")
    const updated = await prisma.sitePage.update({ where: { id }, data: {
      ...(input.title !== undefined ? { title: input.title } : {}), ...(input.slug ? { slug: input.slug } : {}),
      ...(input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber.replace(/\D/g, "") || null } : {}),
      ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}), ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
      ...(input.theme ? { theme: input.theme as Prisma.InputJsonValue } : {}), ...(input.sections ? { sections: input.sections as Prisma.InputJsonValue } : {}) } })
    return NextResponse.json({ ok: true, updatedAt: updated.updatedAt, slug: updated.slug })
  } catch (error) { return fail(error) }
}

// publish | unpublish | duplicate
export async function POST(request: Request, { params }: Context) {
  try {
    const { organizationId } = await requireMember()
    const { id } = await params
    const { action } = z.object({ action: z.enum(["publish", "unpublish", "duplicate"]) }).parse(await request.json())
    const page = await own(organizationId, id)
    if (action === "publish") { const published = await publishPage(organizationId, id); return NextResponse.json({ ok: true, publishedAt: published.publishedAt, message: "Published — your page is live." }) }
    if (action === "unpublish") { await prisma.sitePage.update({ where: { id }, data: { status: "DRAFT" } }); return NextResponse.json({ ok: true, message: "Unpublished — the address now shows “page not found”." }) }
    const allowance = await pageAllowance(organizationId)
    if (!allowance.canCreate) throw Object.assign(new Error(`Your plan includes ${allowance.limit} page${allowance.limit === 1 ? "" : "s"}. Upgrade to create more.`), { status: 402 })
    let slug = `${page.slug}-copy`.slice(0, 60)
    for (let i = 2; await prisma.sitePage.findUnique({ where: { slug } }); i++) slug = `${page.slug.slice(0, 52)}-copy-${i}`
    const copy = await prisma.sitePage.create({ data: { organizationId, type: page.type, slug, title: `${page.title} (copy)`, whatsappNumber: page.whatsappNumber,
      theme: page.theme as Prisma.InputJsonValue, sections: page.sections as Prisma.InputJsonValue, seoTitle: page.seoTitle, seoDescription: page.seoDescription } })
    return NextResponse.json({ ok: true, id: copy.id, message: "Copy created." })
  } catch (error) { return fail(error) }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { organizationId } = await requireMember()
    const { id } = await params
    await own(organizationId, id)
    await prisma.$transaction([prisma.pageClick.deleteMany({ where: { pageId: id } }), prisma.sitePage.delete({ where: { id } })])
    return NextResponse.json({ ok: true, message: "Page deleted." })
  } catch (error) { return fail(error) }
}
