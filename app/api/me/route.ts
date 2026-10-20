import { NextResponse } from "next/server"
import { planState } from "@/lib/billing/limits"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { expireLapsedSubscriptions } from "@/lib/billing/activate"

// Lightweight header data for the app shell (no Meta API calls).
async function accessSummary(organizationId: string) {
  const state = await planState(organizationId)
  const { messages } = state.limits
  return { active: state.active, status: state.status, endsAt: state.endsAt, messagesUsed: state.usage.messages, messagesLimit: messages,
    nearLimit: messages !== null && state.usage.messages >= messages * 0.9, atLimit: messages !== null && state.usage.messages >= messages }
}

export async function GET() {
  const session = await getSession()
  const membership = session?.user.memberships[0]
  if (!session || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await expireLapsedSubscriptions(membership.organizationId)
  const phone = await prisma.phoneNumber.findFirst({
    where: { status: "CONNECTED", waba: { organizationId: membership.organizationId, status: "CONNECTED" } },
    select: { phoneNumber: true },
  })
  const org = membership.organization
  const subscription = org.subscriptions[0]
  return NextResponse.json({
    user: { name: session.user.name, email: session.user.email, isPlatformAdmin: session.user.adminRole !== "NONE" },
    workspace: { id: org.id, name: org.name, role: membership.role, walletBalance: Number(org.walletBalance), currency: org.currency,
      count: session.user.memberships.length },
    access: await accessSummary(membership.organizationId),
    plan: subscription ? { name: subscription.plan.name, status: subscription.status, interval: subscription.billingInterval === "ANNUAL" ? "yearly" : "monthly",
      renewsOn: subscription.currentPeriodEnd, trialEndsAt: subscription.trialEndsAt } : null,
    whatsapp: { connected: Boolean(phone), phoneNumber: phone?.phoneNumber || null },
  })
}
