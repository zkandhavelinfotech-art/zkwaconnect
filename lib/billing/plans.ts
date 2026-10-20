import { prisma } from "@/lib/db/prisma"
import { featuresOf, lockedMessage, type FeatureKey, type PlanSummary } from "./features"

// All plans (with their features), cached briefly: feature checks run on every API request.
type CachedPlan = PlanSummary & { id: string; maxUsers: number | null; maxPhoneNumbers: number | null; maxMessages: number | null; status: boolean }
let cache: { at: number; plans: CachedPlan[] } | null = null
const TTL = 60_000

export async function allPlans() {
  if (cache && Date.now() - cache.at < TTL) return cache.plans
  const rows = await prisma.plan.findMany({ orderBy: { monthlyPrice: "asc" } })
  const plans = rows.map(row => ({ id: row.id, slug: row.slug, name: row.name, monthlyPrice: Number(row.monthlyPrice), features: featuresOf(row),
    maxUsers: row.maxUsers, maxPhoneNumbers: row.maxPhoneNumbers, maxMessages: row.maxMessages, status: row.status }))
  cache = { at: Date.now(), plans }
  return plans
}
export function forgetPlans() { cache = null }

export const freePlan = async () => (await allPlans()).find(plan => plan.slug === "free" && plan.status) || null

type SubscriptionLike = { status: string; currentPeriodEnd: Date | null; plan: { slug: string; features: unknown } } | null | undefined
// The plan a workspace effectively has: its trial/paid plan while current, otherwise the Free plan.
export async function effectivePlan(subscription: SubscriptionLike) {
  const current = subscription && ["TRIAL", "ACTIVE"].includes(subscription.status) && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > new Date())
  if (current) return { slug: subscription!.plan.slug, features: featuresOf(subscription!.plan), onFree: false }
  const free = await freePlan()
  return free ? { slug: free.slug, features: free.features, onFree: true } : null
}

export class FeatureLockedError extends Error {
  readonly status = 402
  constructor(readonly feature: FeatureKey, message: string) { super(message); this.name = "FeatureLockedError" }
}

export async function lockedError(feature: FeatureKey) {
  return new FeatureLockedError(feature, lockedMessage(feature, (await allPlans()).filter(plan => plan.status)))
}
