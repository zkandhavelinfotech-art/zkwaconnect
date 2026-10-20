// One-off / idempotent: give each plan its approved features, mark Business "Most popular" and add the Free plan.
// Run: npx tsx scripts/apply-plan-features.ts   (only fills plans whose features still use the old 4–6 flags)
import { prisma } from "../lib/db/prisma"
import { DEFAULT_PLAN_FEATURES, toFeatureJson } from "../lib/billing/features"

const descriptions: Record<string, string> = {
  free: "For trying ZKWAConnect: the official API and a shared inbox.",
  starter: "For small teams starting broadcasts.",
  business: "Chatbots, automation, analytics and commerce for growing teams.",
  professional: "API, store integrations and Instagram for scaling businesses.",
  enterprise: "White-label, priority support and a dedicated manager.",
}

async function main() {
  await prisma.plan.upsert({ where: { slug: "free" }, update: {},
    create: { name: "Free", slug: "free", monthlyPrice: 0, annualPrice: 0, maxUsers: 1, maxPhoneNumbers: 1, maxMessages: 250 } })
  for (const plan of await prisma.plan.findMany()) {
    const defaults = DEFAULT_PLAN_FEATURES[plan.slug]
    const current = plan.features && typeof plan.features === "object" ? plan.features as Record<string, unknown> : {}
    const upgraded = "whatsappApi" in current
    await prisma.plan.update({ where: { id: plan.id }, data: {
      ...(!upgraded && defaults ? { features: toFeatureJson(defaults) } : {}),
      ...(plan.description ? {} : descriptions[plan.slug] ? { description: descriptions[plan.slug] } : {}),
      isPopular: plan.slug === "business" ? true : plan.isPopular,
    } })
    console.log(`${plan.slug}: ${upgraded ? "kept existing features" : `${defaults?.length ?? 0} features set`}`)
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1) })
