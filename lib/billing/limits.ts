import { prisma } from "@/lib/db/prisma"
import { expireLapsedSubscriptions } from "./activate"

// Plan enforcement: an active (trial or paid) plan is needed to send messages, and the plan's
// monthly message, team-member and WhatsApp-number limits apply. null limit = unlimited.

export class PlanLimitError extends Error {
  readonly status = 402
  constructor(message: string, readonly reason: "expired" | "messages" | "users" | "numbers") {
    super(message)
    this.name = "PlanLimitError"
  }
}

const startOfMonth = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1) }

export async function planState(organizationId: string) {
  await expireLapsedSubscriptions(organizationId)
  const subscription = await prisma.subscription.findFirst({ where: { organizationId, status: { not: "PENDING_PAYMENT" } }, include: { plan: true }, orderBy: { createdAt: "desc" } })
  const active = Boolean(subscription && ["TRIAL", "ACTIVE"].includes(subscription.status) && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > new Date()))
  // Messages are counted per calendar month (resets on the 1st).
  const since = startOfMonth()
  const [messages, users, invites, numbers] = await Promise.all([
    messagesSince(organizationId, since),
    prisma.membership.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.invitation.count({ where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.phoneNumber.count({ where: { status: "CONNECTED", waba: { organizationId } } }),
  ])
  return {
    active, status: subscription?.status || "NONE", planName: subscription?.plan.name || null,
    endsAt: subscription?.status === "TRIAL" ? subscription.trialEndsAt || subscription.currentPeriodEnd : subscription?.currentPeriodEnd || null,
    limits: { messages: subscription?.plan.maxMessages ?? null, users: subscription?.plan.maxUsers ?? null, numbers: subscription?.plan.maxPhoneNumbers ?? null },
    usage: { messages, users, invites, numbers }, periodStart: since,
  }
}

async function messagesSince(organizationId: string, since: Date) {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM messages m JOIN conversations c ON c.id = m."conversationId"
    WHERE c."organizationId" = ${organizationId} AND m.direction = 'OUTBOUND' AND m."createdAt" >= ${since}`
  return rows[0]?.count || 0
}

// Short-lived cache so a broadcast doesn't recount every message; local sends are added on top.
const cache = new Map<string, { at: number; state: Awaited<ReturnType<typeof planState>>; extra: number }>()
const CACHE_MS = 30_000

export async function assertCanSend(organizationId: string, count = 1) {
  let entry = cache.get(organizationId)
  if (!entry || Date.now() - entry.at > CACHE_MS) { entry = { at: Date.now(), state: await planState(organizationId), extra: 0 }; cache.set(organizationId, entry) }
  const { state } = entry
  if (!state.active) throw new PlanLimitError(state.status === "NONE"
    ? "This workspace has no active plan, so messages can't be sent. Choose a plan under Billing."
    : `Your ${state.planName || ""} plan ${state.status === "TRIAL" ? "trial ended" : "expired"}${state.endsAt ? ` on ${state.endsAt.toLocaleDateString("en-IN")}` : ""}. Renew under Billing to keep sending messages.`, "expired")
  const limit = state.limits.messages
  if (limit !== null && state.usage.messages + entry.extra + count > limit)
    throw new PlanLimitError(`You've used this month's ${limit.toLocaleString("en-IN")} messages on the ${state.planName} plan. Upgrade under Billing to send more.`, "messages")
  entry.extra += count
}

export function forgetPlanCache(organizationId: string) { cache.delete(organizationId) }

export async function assertSeatAvailable(organizationId: string) {
  const state = await planState(organizationId)
  const limit = state.limits.users
  if (limit !== null && state.usage.users + state.usage.invites >= limit)
    throw new PlanLimitError(`Your ${state.planName || "current"} plan allows ${limit} team member${limit === 1 ? "" : "s"} (including pending invites). Upgrade under Billing to add more.`, "users")
}

export async function assertNumberAvailable(organizationId: string, adding = 1) {
  const state = await planState(organizationId)
  const limit = state.limits.numbers
  if (limit !== null && state.usage.numbers + adding > limit)
    throw new PlanLimitError(`Your ${state.planName || "current"} plan allows ${limit} WhatsApp number${limit === 1 ? "" : "s"}. Upgrade under Billing to connect more.`, "numbers")
}
