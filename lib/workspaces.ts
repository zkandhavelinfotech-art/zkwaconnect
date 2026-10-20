import { prisma } from "@/lib/db/prisma"
import { isCompanyEmail } from "@/lib/company"
import { TRIAL_DAYS } from "@/lib/billing/reminders"

async function uniqueSlug(base: string): Promise<string> {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace"
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`
    if (!(await prisma.organization.findUnique({ where: { slug: candidate } }))) return candidate
  }
}

// A project workspace: organization + owner membership + onboarding. Customers get a 7-day Business trial (TRIAL_DAYS);
// projects created by the platform owner's company logins are internal (no plan, no limits).
export async function createWorkspace(userId: string, input: { name: string; country?: string; timezone?: string; gstin?: string }) {
  const slug = await uniqueSlug(input.name)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  const internal = await isCompanyEmail(user?.email)
  const organization = await prisma.organization.create({ data: {
    name: input.name, slug, country: input.country || "IN", timezone: input.timezone || "Asia/Kolkata", gstin: input.gstin,
    status: internal ? "ACTIVE" : "TRIAL", billingExempt: internal,
    memberships: { create: { userId, role: "OWNER", status: "ACTIVE" } },
    onboarding: { create: { currentStep: "ACCOUNT_CREATED", status: "ACCOUNT_CREATED" } },
  } })
  const trialPlan = internal ? null
    : await prisma.plan.findFirst({ where: { slug: "business", status: true } }) || await prisma.plan.findUnique({ where: { slug: "starter" } })
  if (trialPlan) {
    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86_400_000)
    await prisma.subscription.create({ data: { organizationId: organization.id, planId: trialPlan.id, status: "TRIAL",
      startDate: new Date(), trialEndsAt: trialEnd, currentPeriodStart: new Date(), currentPeriodEnd: trialEnd } })
  }
  return organization
}
