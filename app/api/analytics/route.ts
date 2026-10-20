import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { campaignStats } from "@/lib/campaigns/stats"

export const runtime = "nodejs"

type DayRow = { day: string; inbound: number; outbound: number }
type CountRow = { key: string | null; count: number }

// Workspace analytics for the last N days. Days are bucketed in the workspace's time zone.
export async function GET(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const days = [7, 30, 90].includes(Number(new URL(request.url).searchParams.get("days"))) ? Number(new URL(request.url).searchParams.get("days")) : 30
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } })
    let tz = org.timezone || "Asia/Kolkata"
    try { new Intl.DateTimeFormat("en", { timeZone: tz }) } catch { tz = "Asia/Kolkata" }
    const since = new Date(Date.now() - days * 86_400_000)

    const clicks = await prisma.trackedLink.aggregate({ where: { organizationId, firstClickedAt: { gte: since } }, _count: { _all: true }, _sum: { clicks: true } })
    const [volume, statuses, senders, responseTimes, newConversations, newContacts, contactSources, categories, conversationStates, campaigns, ads, totals] = await Promise.all([
      prisma.$queryRaw<DayRow[]>`
        SELECT to_char(date_trunc('day', (m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day,
               COUNT(*) FILTER (WHERE m.direction = 'INBOUND')::int AS inbound, COUNT(*) FILTER (WHERE m.direction = 'OUTBOUND')::int AS outbound
        FROM messages m JOIN conversations c ON c.id = m."conversationId"
        WHERE c."organizationId" = ${organizationId} AND m."createdAt" >= ${since} AND m.direction IN ('INBOUND','OUTBOUND')
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<CountRow[]>`
        SELECT m.status AS key, COUNT(*)::int AS count FROM messages m JOIN conversations c ON c.id = m."conversationId"
        WHERE c."organizationId" = ${organizationId} AND m."createdAt" >= ${since} AND m.direction = 'OUTBOUND' GROUP BY 1`,
      prisma.$queryRaw<CountRow[]>`
        SELECT CASE WHEN m.metadata->>'campaignId' IS NOT NULL THEN 'broadcast'
                    WHEN m.metadata->>'source' = 'API' THEN 'api'
                    WHEN m.metadata->>'source' = 'AWAY_MESSAGE' THEN 'away'
                    WHEN m.metadata->>'workflowId' IS NOT NULL THEN 'chatbot'
                    WHEN m."senderUserId" IS NOT NULL THEN 'agent' ELSE 'other' END AS key, COUNT(*)::int AS count
        FROM messages m JOIN conversations c ON c.id = m."conversationId"
        WHERE c."organizationId" = ${organizationId} AND m."createdAt" >= ${since} AND m.direction = 'OUTBOUND' GROUP BY 1`,
      // First human reply to each customer turn (a customer message that follows our message, or opens the chat).
      prisma.$queryRaw<{ userId: string; replies: number; median: number; average: number }[]>`
        WITH ordered AS (
          SELECT m.id, m."conversationId", m."createdAt", m.direction,
                 LAG(m.direction) OVER (PARTITION BY m."conversationId" ORDER BY m."createdAt") AS previous
          FROM messages m JOIN conversations c ON c.id = m."conversationId"
          WHERE c."organizationId" = ${organizationId} AND m."createdAt" >= ${since} AND m.direction IN ('INBOUND','OUTBOUND')
        ), turns AS (
          SELECT * FROM ordered WHERE direction = 'INBOUND' AND (previous IS NULL OR previous = 'OUTBOUND')
        )
        SELECT r."senderUserId" AS "userId", COUNT(*)::int AS replies,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM r."createdAt" - t."createdAt")))::float AS median,
               AVG(EXTRACT(EPOCH FROM r."createdAt" - t."createdAt"))::float AS average
        FROM turns t
        JOIN LATERAL (SELECT "createdAt", "senderUserId" FROM messages
                      WHERE "conversationId" = t."conversationId" AND direction = 'OUTBOUND' AND "senderUserId" IS NOT NULL AND "createdAt" > t."createdAt"
                      ORDER BY "createdAt" LIMIT 1) r ON r."createdAt" - t."createdAt" < interval '7 days'
        GROUP BY 1`,
      prisma.$queryRaw<{ day: string; count: number }[]>`
        SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
        FROM conversations WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ day: string; count: number }[]>`
        SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
        FROM contacts WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      prisma.contact.groupBy({ by: ["source"], where: { organizationId, createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.$queryRaw<CountRow[]>`
        SELECT t.category AS key, COUNT(*)::int AS count
        FROM messages m JOIN conversations c ON c.id = m."conversationId" JOIN templates t ON t.id = m.metadata->>'templateId'
        WHERE c."organizationId" = ${organizationId} AND m."createdAt" >= ${since} AND m.direction = 'OUTBOUND' AND m.type = 'TEMPLATE' GROUP BY 1`,
      prisma.conversation.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
      prisma.campaign.findMany({ where: { organizationId, startedAt: { gte: since } }, orderBy: { startedAt: "desc" }, take: 10,
        select: { id: true, name: true, status: true, startedAt: true, template: { select: { name: true } } } }),
      prisma.adReferral.groupBy({ by: ["sourceId", "headline", "sourceType"], where: { organizationId, createdAt: { gte: since } }, _count: { _all: true },
        orderBy: { _count: { id: "desc" } }, take: 10 }),
      Promise.all([prisma.contact.count({ where: { organizationId } }), prisma.contact.count({ where: { organizationId, optedIn: true } })]),
    ])

    const userIds = responseTimes.map(row => row.userId)
    const [users, openByAgent, sentByAgent, stats] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds.length ? userIds : ["-"] } }, select: { id: true, name: true } }),
      prisma.conversation.groupBy({ by: ["assignedUserId"], where: { organizationId, status: { in: ["OPEN", "PENDING"] }, assignedUserId: { not: null } }, _count: { _all: true } }),
      prisma.$queryRaw<{ userId: string; count: number }[]>`
        SELECT m."senderUserId" AS "userId", COUNT(*)::int AS count FROM messages m JOIN conversations c ON c.id = m."conversationId"
        WHERE c."organizationId" = ${organizationId} AND m."createdAt" >= ${since} AND m.direction = 'OUTBOUND' AND m."senderUserId" IS NOT NULL GROUP BY 1`,
      campaignStats(campaigns.map(campaign => campaign.id)),
    ])
    const members = await prisma.membership.findMany({ where: { organizationId, status: "ACTIVE" }, select: { user: { select: { id: true, name: true } } } })
    const agentIds = [...new Set([...members.map(member => member.user.id), ...userIds])]
    const nameOf = (id: string) => members.find(member => member.user.id === id)?.user.name || users.find(user => user.id === id)?.name || "Former member"

    const count = (rows: CountRow[], ...keys: string[]) => rows.filter(row => keys.includes(row.key || "")).reduce((sum, row) => sum + row.count, 0)
    const outbound = statuses.reduce((sum, row) => sum + row.count, 0)
    const allResponses = responseTimes.reduce((acc, row) => ({ replies: acc.replies + row.replies, weighted: acc.weighted + row.average * row.replies }), { replies: 0, weighted: 0 })

    return NextResponse.json({
      days, timezone: tz,
      series: { messages: volume, conversations: newConversations, contacts: newContacts },
      totals: {
        inbound: volume.reduce((sum, row) => sum + row.inbound, 0), outbound,
        delivered: count(statuses, "DELIVERED", "READ"), read: count(statuses, "READ"), failed: count(statuses, "FAILED"),
        newConversations: newConversations.reduce((sum, row) => sum + row.count, 0), newContacts: newContacts.reduce((sum, row) => sum + row.count, 0),
        contacts: totals[0], optedIn: totals[1], avgFirstResponseSeconds: allResponses.replies ? allResponses.weighted / allResponses.replies : null,
        linksClicked: clicks._count._all, linkClicks: clicks._sum.clicks || 0,
      },
      senders: Object.fromEntries(senders.map(row => [row.key, row.count])),
      categories: Object.fromEntries(categories.map(row => [row.key || "UNKNOWN", row.count])),
      conversationStates: Object.fromEntries(conversationStates.map(row => [row.status, row._count._all])),
      contactSources: contactSources.map(row => ({ source: row.source || "MANUAL", count: row._count._all })).sort((a, b) => b.count - a.count),
      agents: agentIds.map(id => {
        const times = responseTimes.find(row => row.userId === id)
        return { id, name: nameOf(id), messages: sentByAgent.find(row => row.userId === id)?.count || 0, replies: times?.replies || 0,
          medianSeconds: times?.median ?? null, open: openByAgent.find(row => row.assignedUserId === id)?._count._all || 0 }
      }).sort((a, b) => b.messages - a.messages),
      campaigns: campaigns.map(campaign => ({ ...campaign, stats: stats.get(campaign.id) })),
      ads: ads.map(row => ({ sourceId: row.sourceId, headline: row.headline, sourceType: row.sourceType, leads: row._count._all })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load analytics." }, { status: errorStatus(error) })
  }
}
