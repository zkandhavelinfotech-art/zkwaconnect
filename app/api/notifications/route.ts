import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) })
const visibleTo = (organizationId: string, userId: string) => ({ organizationId, OR: [{ userId: null }, { userId }] })

// The workspace's in-app notifications (bell in the top bar): workspace-wide ones plus those addressed to this user.
export async function GET() {
  try {
    const { organizationId, userId } = await requireMember()
    const where = visibleTo(organizationId, userId)
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, type: true, title: true, message: true, readAt: true, metadata: true, createdAt: true } }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ])
    return NextResponse.json({ items, unread })
  } catch (error) { return fail(error) }
}

// Mark one notification (id) or all of them as read.
export async function POST(request: Request) {
  try {
    const { organizationId, userId } = await requireMember()
    const { id } = z.object({ id: z.string().min(1).optional() }).parse(await request.json().catch(() => ({})))
    await prisma.notification.updateMany({ where: { ...visibleTo(organizationId, userId), readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } })
    return NextResponse.json({ ok: true })
  } catch (error) { return fail(error) }
}
