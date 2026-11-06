import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { apiHandler } from "@/lib/developer/api"

// GET /api/v1/usage — API usage statistics and rate limit info
export const GET = apiHandler(
  async (_request, { organizationId, rateLimit }) => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [todayCount, monthCount, contactsCount, keysCount, hooksCount] = await Promise.all([
      prisma.message.count({
        where: {
          direction: "OUTBOUND",
          createdAt: { gte: startOfDay },
          conversation: { organizationId },
        },
      }),
      prisma.message.count({
        where: {
          direction: "OUTBOUND",
          createdAt: { gte: startOfMonth },
          conversation: { organizationId },
        },
      }),
      prisma.contact.count({ where: { organizationId } }),
      prisma.apiKey.count({ where: { organizationId, revokedAt: null } }),
      prisma.webhookEndpoint.count({ where: { organizationId, active: true } }),
    ])

    return NextResponse.json({
      usage: {
        messages_sent_today: todayCount,
        messages_sent_this_month: monthCount,
        total_contacts: contactsCount,
        active_api_keys: keysCount,
        active_webhooks: hooksCount,
      },
      rate_limits: {
        requests_per_minute: rateLimit,
        window_seconds: 60,
      },
      server_time: new Date().toISOString(),
    })
  },
  { scope: "account:read" }
)

