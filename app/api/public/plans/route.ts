import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { FEATURE_KEYS, FEATURES, featuresOf } from "@/lib/billing/features"
import { effectiveMode, getMessagingSettings, priceOf } from "@/lib/billing/messaging"

export const dynamic = "force-dynamic"

// Public plan list for the marketing page: the same prices, limits and features as the app.
export async function GET() {
  const [plans, settings] = await Promise.all([
    prisma.plan.findMany({ where: { status: true }, orderBy: { monthlyPrice: "asc" } }),
    getMessagingSettings(),
  ])
  const mode = effectiveMode(settings, null)
  return NextResponse.json({
    plans: plans.map(plan => ({ slug: plan.slug, name: plan.name, description: plan.description, monthlyPrice: Number(plan.monthlyPrice),
      annualPrice: plan.annualPrice === null ? null : Number(plan.annualPrice), popular: plan.isPopular,
      limits: { users: plan.maxUsers, numbers: plan.maxPhoneNumbers, messages: plan.maxMessages }, features: featuresOf(plan) })),
    features: FEATURE_KEYS.map(key => ({ key, ...FEATURES[key] })),
    // What a message costs under the platform's default charging option (Meta's rate for "pay Meta directly").
    messageRates: { mode, marketing: priceOf(settings, mode, "MARKETING"), utility: priceOf(settings, mode, "UTILITY"), authentication: priceOf(settings, mode, "AUTHENTICATION"),
      currency: settings.currency },
  }, { headers: { "Cache-Control": "public, max-age=300" } })
}
