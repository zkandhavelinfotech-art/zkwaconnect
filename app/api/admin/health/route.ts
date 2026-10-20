import { NextResponse } from "next/server"
import { prisma }        from "@/lib/db/prisma"
import { getSession }    from "@/lib/auth/session"

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user || session.user.adminRole === "NONE")
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })

    const [totalOrgs, activeOrgs, trialOrgs, pendingPayments, totalMessages, recentWebhooks] =
      await Promise.all([
        prisma.organization.count(),
        prisma.organization.count({ where: { status: "ACTIVE" } }),
        prisma.organization.count({ where: { status: "TRIAL" } }),
        prisma.payment.count({ where: { status: "PENDING" } }),
        prisma.message.count(),
        prisma.webhookEvent.findMany({
          orderBy: { createdAt: "desc" }, take: 5,
          select: { id:true, eventType:true, status:true, createdAt:true, wabaId:true },
        }),
      ])

    return NextResponse.json({
      stats: { totalOrgs, activeOrgs, trialOrgs, pendingPayments, totalMessages },
      recentWebhooks,
      health: { db: "ok", api: "ok", timestamp: new Date().toISOString() },
    })
  } catch (e) {
    return NextResponse.json({ error: "Health check failed" }, { status: 500 })
  }
}
