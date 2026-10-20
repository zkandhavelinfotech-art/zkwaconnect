import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { FEATURE_KEYS, FEATURES, featuresOf, toFeatureJson, type FeatureKey } from "@/lib/billing/features"
import { forgetPlans } from "@/lib/billing/plans"

async function superAdmin() {
  const session = await getSession()
  if (session?.user.adminRole !== "SUPER_ADMIN") throw Object.assign(new Error("Super admin access required."), { status: 403 })
}
const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: (error as { status?: number }).status || 400 })

export async function GET() {
  try {
    await superAdmin()
    const plans = await prisma.plan.findMany({ orderBy: { monthlyPrice: "asc" }, include: { _count: { select: { subscriptions: { where: { status: { in: ["TRIAL", "ACTIVE"] } } } } } } })
    return NextResponse.json({ features: FEATURE_KEYS.map(key => ({ key, ...FEATURES[key] })),
      plans: plans.map(plan => ({ id: plan.id, slug: plan.slug, name: plan.name, description: plan.description, monthlyPrice: Number(plan.monthlyPrice),
        annualPrice: plan.annualPrice === null ? null : Number(plan.annualPrice), maxUsers: plan.maxUsers, maxPhoneNumbers: plan.maxPhoneNumbers, maxMessages: plan.maxMessages,
        isPopular: plan.isPopular, status: plan.status, features: featuresOf(plan), workspaces: plan._count.subscriptions })) })
  } catch (error) { return fail(error) }
}

const limit = z.number().int().min(0).max(100_000_000).nullable()
const schema = z.object({
  id: z.string().min(1), name: z.string().trim().min(2).max(40), description: z.string().trim().max(200).nullable(),
  monthlyPrice: z.number().min(0).max(10_000_000), annualPrice: z.number().min(0).max(100_000_000).nullable(),
  maxUsers: limit, maxPhoneNumbers: limit, maxMessages: limit, isPopular: z.boolean(), status: z.boolean(),
  features: z.array(z.enum(FEATURE_KEYS as [FeatureKey, ...FeatureKey[]])),
})

export async function PUT(request: Request) {
  try {
    await superAdmin()
    const input = schema.parse(await request.json())
    const plan = await prisma.plan.findUnique({ where: { id: input.id } })
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 })
    if (plan.slug === "free" && input.monthlyPrice > 0) return NextResponse.json({ error: "The Free plan must stay at ₹0." }, { status: 400 })
    await prisma.$transaction([
      ...(input.isPopular ? [prisma.plan.updateMany({ where: { id: { not: plan.id } }, data: { isPopular: false } })] : []),
      prisma.plan.update({ where: { id: plan.id }, data: { name: input.name, description: input.description, monthlyPrice: input.monthlyPrice, annualPrice: input.annualPrice,
        maxUsers: input.maxUsers, maxPhoneNumbers: input.maxPhoneNumbers, maxMessages: input.maxMessages, isPopular: input.isPopular, status: input.status,
        features: toFeatureJson(input.features) } }),
    ])
    forgetPlans()
    return NextResponse.json({ ok: true, message: `${input.name} saved. Workspaces on this plan get the new features and limits within a minute.` })
  } catch (error) { return fail(error) }
}
