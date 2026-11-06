import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { apiHandler } from "@/lib/developer/api"

// GET /api/v1/account — organization information, plan, wallet balance, and WABA status.
export const GET = apiHandler(
  async (_request, { organizationId, applicationName, scopes, rateLimit }) => {
    const [org, waba, subscription, phoneCount] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          walletBalance: true,
          currency: true,
          createdAt: true,
        },
      }),
      prisma.waba.findFirst({
        where: { organizationId, status: "CONNECTED" },
        select: {
          id: true,
          wabaId: true,
          name: true,
          timezone: true,
          status: true,
          verificationStatus: true,
        },
      }),
      prisma.subscription.findFirst({
        where: { organizationId, status: "ACTIVE" },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.phoneNumber.count({
        where: { waba: { organizationId }, status: "CONNECTED" },
      }),
    ])

    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status.toLowerCase(),
        wallet_balance: Number(org.walletBalance || 0),
        currency: org.currency || "INR",
        created_at: org.createdAt,
      },
      plan: subscription?.plan
        ? {
            slug: subscription.plan.slug,
            name: subscription.plan.name,
            monthly_messages: subscription.plan.maxMessages,
            current_period_end: subscription.currentPeriodEnd,
          }
        : {
            slug: "free",
            name: "Free Trial",
            monthly_messages: 1000,
          },
      whatsapp: {
        connected: Boolean(waba),
        waba_id: waba?.wabaId || null,
        name: waba?.name || null,
        phone_numbers_count: phoneCount,
        verified_status: waba?.verificationStatus || null,
      },
      api_client: {
        application_name: applicationName,
        granted_scopes: scopes,
        rate_limit_per_minute: rateLimit,
      },
    })
  },
  { scope: "account:read" }
)
