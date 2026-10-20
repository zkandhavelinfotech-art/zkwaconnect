import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"

const schema = z.object({
  shortcut: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,30}$/, "Shortcut: 2–30 letters, numbers, - or _ (no spaces)."),
  content: z.string().trim().min(1, "Write the reply text.").max(4096),
})

function fail(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message
    : (error as { code?: string }).code === "P2002" ? "That shortcut is already used." : error instanceof Error ? error.message : "Failed"
  return NextResponse.json({ error: message }, { status: errorStatus(error) })
}

export async function GET() {
  try {
    const { organizationId } = await requireMember()
    return NextResponse.json({ quickReplies: await prisma.quickReply.findMany({ where: { organizationId }, orderBy: { shortcut: "asc" } }) })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const input = schema.parse(await request.json())
    if (await prisma.quickReply.count({ where: { organizationId } }) >= 200) throw new Error("Up to 200 quick replies.")
    return NextResponse.json({ quickReply: await prisma.quickReply.create({ data: { organizationId, ...input } }) }, { status: 201 })
  } catch (error) { return fail(error) }
}

export async function PATCH(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const body = await request.json()
    const input = schema.parse(body)
    const updated = await prisma.quickReply.updateMany({ where: { id: String(body.id || ""), organizationId }, data: input })
    if (!updated.count) return NextResponse.json({ error: "Quick reply not found." }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) { return fail(error) }
}

export async function DELETE(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    await prisma.quickReply.deleteMany({ where: { id: new URL(request.url).searchParams.get("id") || "", organizationId } })
    return NextResponse.json({ ok: true })
  } catch (error) { return fail(error) }
}
