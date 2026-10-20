import { prisma } from "@/lib/db/prisma"

// Live counts per broadcast, computed from the recipient rows.
export type CampaignStats = { total: number; queued: number; sent: number; delivered: number; read: number; replied: number; clicked: number; failed: number; skipped: number }

export async function campaignStats(campaignIds: string[]) {
  const stats = new Map<string, CampaignStats>()
  if (!campaignIds.length) return stats
  const [groups, replied, clicked] = await Promise.all([
    prisma.campaignRecipient.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: campaignIds } }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ["campaignId"], where: { campaignId: { in: campaignIds }, repliedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ["campaignId"], where: { campaignId: { in: campaignIds }, clickedAt: { not: null } }, _count: { _all: true } }),
  ])
  for (const id of campaignIds) stats.set(id, { total: 0, queued: 0, sent: 0, delivered: 0, read: 0, replied: 0, clicked: 0, failed: 0, skipped: 0 })
  for (const group of groups) {
    const item = stats.get(group.campaignId)!
    const n = group._count._all
    item.total += n
    if (group.status === "QUEUED" || group.status === "SENDING") item.queued += n
    if (["SENT", "DELIVERED", "READ"].includes(group.status)) item.sent += n
    if (["DELIVERED", "READ"].includes(group.status)) item.delivered += n
    if (group.status === "READ") item.read += n
    if (group.status === "FAILED") item.failed += n
    if (group.status === "SKIPPED") item.skipped += n
  }
  for (const group of replied) stats.get(group.campaignId)!.replied = group._count._all
  for (const group of clicked) stats.get(group.campaignId)!.clicked = group._count._all
  return stats
}
