import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { createPage, pageAllowance, pageStats } from "@/lib/pages/pages"
import { PAGE_TEMPLATES } from "@/lib/pages/templates"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Request failed" }, { status: errorStatus(error) })

// The workspace's WhatsApp pages with 30-day taps/chats, the plan allowance and the templates to start from.
export async function GET() {
  try {
    const { organizationId } = await requireMember()
    const pages = await prisma.sitePage.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" },
      select: { id: true, type: true, slug: true, title: true, status: true, views: true, publishedAt: true, updatedAt: true } })
    const stats = await pageStats(organizationId, pages.map(page => page.id))
    return NextResponse.json({ pages: pages.map(page => ({ ...page, ...stats[page.id] })), allowance: await pageAllowance(organizationId),
      templates: PAGE_TEMPLATES.map(({ id, type, label, emoji, description }) => ({ id, type, label, emoji, description })),
      base: (process.env.APP_URL || "").replace(/\/+$/, "") })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const input = z.object({ templateId: z.string().min(1).max(40), title: z.string().trim().max(120).optional(), slug: z.string().trim().max(60).optional().or(z.literal("")) }).parse(await request.json())
    const page = await createPage(organizationId, { templateId: input.templateId, title: input.title, slug: input.slug || undefined })
    return NextResponse.json({ ok: true, id: page.id }, { status: 201 })
  } catch (error) { return fail(error) }
}
