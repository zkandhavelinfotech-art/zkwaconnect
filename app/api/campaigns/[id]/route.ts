import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { campaignStats } from "@/lib/campaigns/stats"

export const runtime = "nodejs"

const FILTERS: Record<string, Prisma.CampaignRecipientWhereInput> = {
  all: {},
  queued: { status: { in: ["QUEUED", "SENDING"] } },
  sent: { status: { in: ["SENT", "DELIVERED", "READ"] } },
  delivered: { status: { in: ["DELIVERED", "READ"] } },
  read: { status: "READ" },
  replied: { repliedAt: { not: null } },
  clicked: { clickedAt: { not: null } },
  failed: { status: "FAILED" },
  skipped: { status: "SKIPPED" },
}
const PAGE_SIZE = 50

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value)
  // Prefix formula-like values so spreadsheets don't execute them.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// Broadcast report: totals, failure reasons and the recipient list (paged, or as CSV).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  const membership = session?.user.memberships.find(item => item.status === "ACTIVE")
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const campaign = await prisma.campaign.findFirst({ where: { id, organizationId: membership.organizationId },
    include: { phoneNumber: { select: { displayName: true, phoneNumber: true } }, template: { select: { name: true, language: true, status: true, content: true, category: true } } } })
  if (!campaign) return NextResponse.json({ error: "Broadcast not found." }, { status: 404 })

  const url = new URL(request.url)
  const filter = FILTERS[url.searchParams.get("status") || "all"] || FILTERS.all
  const q = (url.searchParams.get("q") || "").trim()
  const where: Prisma.CampaignRecipientWhereInput = { campaignId: id, ...filter,
    ...(q ? { OR: [{ phone: { contains: q.replace(/\D/g, "") || q } }, { name: { contains: q, mode: "insensitive" } }] } : {}) }

  if (url.searchParams.get("format") === "csv") {
    const header = ["Name", "Phone", "Status", "Replied", "Clicked", "Sent at", "Delivered at", "Read at", "Replied at", "Clicked at", "Error code", "Error", "Attempts"]
    const lines = [header.join(",")]
    let cursor: string | undefined
    for (;;) {
      const rows = await prisma.campaignRecipient.findMany({ where, orderBy: { id: "asc" }, take: 2000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
      for (const row of rows) lines.push([row.name, row.phone, row.status, row.repliedAt ? "yes" : "", row.clickedAt ? "yes" : "", row.sentAt, row.deliveredAt, row.readAt, row.repliedAt, row.clickedAt,
        row.errorCode, row.errorMessage, row.attempts].map(csvCell).join(","))
      if (rows.length < 2000) break
      cursor = rows[rows.length - 1].id
    }
    const filename = `${campaign.name.replace(/[^\w-]+/g, "_").slice(0, 60) || "broadcast"}-report.csv`
    return new Response("\uFEFF" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } })
  }

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
  const [stats, matching, recipients, reasons] = await Promise.all([
    campaignStats([id]),
    prisma.campaignRecipient.count({ where }),
    prisma.campaignRecipient.findMany({ where, orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, name: true, phone: true, status: true, attempts: true, errorCode: true, errorMessage: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true, clickedAt: true, failedAt: true, nextAttemptAt: true } }),
    prisma.campaignRecipient.groupBy({ by: ["errorCode", "errorMessage"], where: { campaignId: id, status: { in: ["FAILED", "SKIPPED"] } },
      _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
  ])
  return NextResponse.json({
    campaign, stats: stats.get(id), recipients, page, pageSize: PAGE_SIZE, matching,
    reasons: reasons.map(reason => ({ code: reason.errorCode, message: reason.errorMessage, count: reason._count._all })),
  })
}
