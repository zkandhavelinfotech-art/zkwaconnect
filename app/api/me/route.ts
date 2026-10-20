import { NextResponse } from "next/server"
import { allPlans } from "@/lib/billing/plans"
import { planState } from "@/lib/billing/limits"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { expireLapsedSubscriptions } from "@/lib/billing/activate"

// Lightweight header data for the app shell (no Meta API calls).
async function accessSummary(organizationId: string) {
  const state = await planState(organizationId)
  const { messages } = state.limits
  const plans = (await allPlans()).filter(plan => plan.status)
  const current = plans.find(plan => plan.slug === state.planSlug)
  // The next paid plan up, and what it would add — for "Upgrade to unlock …" prompts.
  const next = plans.find(plan => plan.monthlyPrice > (current?.monthlyPrice ?? -1) && plan.monthlyPrice > 0)
  return { active: state.active, onFree: state.onFree, internal: state.internal, status: state.status, endsAt: state.endsAt, planName: state.planName, planSlug: state.planSlug,
    features: state.features, messagesUsed: state.usage.messages, messagesLimit: messages,
    nearLimit: messages !== null && state.usage.messages >= messages * 0.9, atLimit: messages !== null && state.usage.messages >= messages,
    next: next && !state.internal ? { name: next.name, slug: next.slug, monthlyPrice: next.monthlyPrice, adds: next.features.filter(feature => !state.features.includes(feature)) } : null,
    plans: plans.map(plan => ({ slug: plan.slug, name: plan.name, monthlyPrice: plan.monthlyPrice, features: plan.features })) }
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
