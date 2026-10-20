import { prisma } from "@/lib/db/prisma"
import { sendPush } from "@/lib/push"

// Upgrade reminders for customer workspaces: the trial (or a paid plan) ends in 3 days, ends tomorrow, and has ended.
// Each stage is sent once per subscription as an in-app notification plus a web push to the owners and admins.
// Internal workspaces never get these.

export const TRIAL_DAYS = 7
const DAY = 86_400_000
const STAGES = [
  { key: "ENDED", from: -3 * DAY, to: 0 },
  { key: "1D", from: 0, to: DAY },
  { key: "3D", from: DAY, to: 3 * DAY },
] as const

let lastRun = 0

export async function sendPlanReminders(now = new Date(), force = false) {
  // Hourly is plenty; the background loop calls this every few seconds.
  if (!force && now.getTime() - lastRun < 3_600_000) return 0
  lastRun = now.getTime()
  const subscriptions = await prisma.subscription.findMany({
    where: { status: { in: ["TRIAL", "ACTIVE", "EXPIRED"] }, currentPeriodEnd: { gte: new Date(now.getTime() - 3 * DAY), lte: new Date(now.getTime() + 3 * DAY) },
      organization: { billingExempt: false, status: { not: "SUSPENDED" } } },
    include: { plan: true },
  })
  let sent = 0
  for (const subscription of subscriptions) {
    const left = subscription.currentPeriodEnd!.getTime() - now.getTime()
    const stage = STAGES.find(item => left >= item.from && left < item.to)
    if (!stage) continue
    const trial = subscription.trialEndsAt !== null && subscription.status !== "ACTIVE"
    // A newer paid or pending plan replaces this one: nothing to remind about.
    const replaced = await prisma.subscription.count({ where: { organizationId: subscription.organizationId, createdAt: { gt: subscription.createdAt },
      status: { in: ["ACTIVE", "PENDING_PAYMENT", "TRIAL"] } } })
    if (replaced) continue
    const type = `${trial ? "TRIAL" : "PLAN"}_${stage.key}`
    const already = await prisma.notification.count({ where: { organizationId: subscription.organizationId, type, metadata: { path: ["subscriptionId"], equals: subscription.id } } })
    if (already) continue
    const day = subscription.currentPeriodEnd!.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    const what = trial ? `Your ${TRIAL_DAYS}-day ${subscription.plan.name} trial` : `Your ${subscription.plan.name} plan`
    const title = stage.key === "ENDED" ? `${trial ? "Free trial" : "Plan"} ended — upgrade to keep your features` : `${what} ends ${stage.key === "1D" ? "tomorrow" : `on ${day}`}`
    const message = stage.key === "ENDED"
      ? `${what} ended on ${day}. Your workspace is now on the Free plan, so broadcasts, chatbots and other ${subscription.plan.name} features are locked. Choose a plan under Billing to unlock them again.`
      : `${what} ends on ${day}. Choose a plan under Billing so broadcasts, chatbots and your other ${subscription.plan.name} features keep working.`
    await prisma.notification.create({ data: { organizationId: subscription.organizationId, type, title, message,
      metadata: { subscriptionId: subscription.id, url: `/app/billing?plan=${subscription.plan.slug}` } } })
    const admins = await prisma.membership.findMany({ where: { organizationId: subscription.organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } })
    await sendPush(admins.map(member => member.userId), { title, body: message.slice(0, 160), url: "/app/billing", tag: `plan-${subscription.id}` }).catch(() => 0)
    sent++
  }
  return sent
}
