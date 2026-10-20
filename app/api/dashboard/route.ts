import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"

// Real numbers for the dashboard cards.
export async function GET() {
  const session = await getSession()
  const organizationId = session?.user.memberships[0]?.organizationId
  if (!organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [openConversations, unread, contacts, optedIn, runningCampaigns, messagesSent, activeFlows, phone] = await Promise.all([
    prisma.conversation.count({ where: { organizationId, status: "OPEN" } }),
    prisma.conversation.aggregate({ where: { organizationId }, _sum: { unreadCount: true } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.contact.count({ where: { organizationId, optedIn: true } }),
    prisma.campaign.count({ where: { organizationId, status: { in: ["RUNNING", "SCHEDULED"] } } }),
    prisma.message.count({ where: { direction: "OUTBOUND", createdAt: { gte: since }, conversation: { organizationId } } }),
    prisma.workflow.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.phoneNumber.findFirst({ where: { status: "CONNECTED", waba: { organizationId, status: "CONNECTED" } },
      select: { phoneNumber: true, displayName: true } }),
  ])
  return NextResponse.json({
    openConversations, unread: unread._sum.unreadCount || 0, contacts, optedIn, runningCampaigns, messagesSent, activeFlows,
    whatsapp: phone ? { phoneNumber: phone.phoneNumber, displayName: phone.displayName } : null,
  })
}
