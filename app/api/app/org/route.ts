import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { planState } from "@/lib/billing/limits"

// Current workspace summary (kept from v5.0.0's /api/app/org): organisation, plan and WhatsApp wallet ("credits") balance.
export async function GET() {
  try {
    const { organizationId, role } = await requireMember()
    const [org, state] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true, slug: true, legalName: true, gstin: true, country: true, timezone: true,
        currency: true, status: true, walletBalance: true, billingExempt: true, createdAt: true } }),
      planState(organizationId),
    ])
    return NextResponse.json({ org: { ...org, walletBalance: Number(org.walletBalance) }, role,
      plan: { name: state.planName, slug: state.planSlug, status: state.status, endsAt: state.endsAt, internal: state.internal, limits: state.limits, usage: state.usage },
      credits: Number(org.walletBalance) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) })
  }
}
