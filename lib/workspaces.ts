import { prisma } from "@/lib/db/prisma"

async function uniqueSlug(base: string): Promise<string> {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace"
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`
    if (!(await prisma.organization.findUnique({ where: { slug: candidate } }))) return candidate
  }
}

// A project workspace: organization + owner membership + onboarding + 14-day Starter trial.
export async function createWorkspace(userId: string, input: { name: string; country?: string; timezone?: string; gstin?: string }) {
  const slug = await uniqueSlug(input.name)
  const organization = await prisma.organization.create({ data: {
    name: input.name, slug, country: input.country || "IN", timezone: input.timezone || "Asia/Kolkata", gstin: input.gstin, status: "TRIAL",
    memberships: { create: { userId, role: "OWNER", status: "ACTIVE" } },
    onboarding: { create: { currentStep: "ACCOUNT_CREATED", status: "ACCOUNT_CREATED" } },
  } })
  const starterPlan = await prisma.plan.findUnique({ where: { slug: "starter" } })
  if (starterPlan) {
    const trialEnd = new Date(Date.now() + 14 * 86_400_000)
    await prisma.subscription.create({ data: { organizationId: organization.id, planId: starterPlan.id, status: "TRIAL",
      startDate: new Date(), trialEndsAt: trialEnd, currentPeriodStart: new Date(), currentPeriodEnd: trialEnd } })
  }
  return organization
}
