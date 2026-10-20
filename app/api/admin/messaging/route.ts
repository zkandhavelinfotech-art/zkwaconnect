import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { compareCosts, creditWallet, effectiveMode, getMessagingSettings, MODES, saveMessagingSettings, settingsSchema, templateUsage } from "@/lib/billing/messaging"

async function admin(roles: string[]) {
  const session = await getSession()
  if (!session?.user || !roles.includes(session.user.adminRole)) throw Object.assign(new Error(`${roles[0] === "SUPER_ADMIN" && roles.length === 1 ? "Super admin" : "Admin"} access required.`), { status: 403 })
  return session.user
}
const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: (error as { status?: number }).status || 400 })

// Settings, every workspace's option + wallet, and platform-wide usage for comparing the three options.
export async function GET() {
  try {
    await admin(["SUPER_ADMIN", "ADMIN", "FINANCE"])
    const settings = await getMessagingSettings()
    const orgs = await prisma.organization.findMany({ orderBy: { createdAt: "desc" }, take: 200,
      select: { id: true, name: true, slug: true, messagingBillingMode: true, walletBalance: true, currency: true } })
    const usage = await Promise.all(orgs.map(org => templateUsage(org.id, 30)))
    const total = usage.reduce((sum, item) => ({ MARKETING: sum.MARKETING + item.MARKETING, UTILITY: sum.UTILITY + item.UTILITY, AUTHENTICATION: sum.AUTHENTICATION + item.AUTHENTICATION }),
      { MARKETING: 0, UTILITY: 0, AUTHENTICATION: 0 })
    const revenue = await prisma.walletTransaction.groupBy({ by: ["mode"], where: { type: { in: ["DEBIT", "REFUND"] }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      _sum: { amount: true, metaCost: true } })
    return NextResponse.json({
      settings, modes: MODES,
      workspaces: orgs.map((org, index) => ({ ...org, walletBalance: Number(org.walletBalance), override: org.messagingBillingMode,
        mode: effectiveMode(settings, org.messagingBillingMode), usage: usage[index] })),
      platformUsage: total, comparison: compareCosts(settings, total),
      walletRevenue30d: revenue.map(row => ({ mode: row.mode, charged: -Number(row._sum.amount || 0), metaCost: Number(row._sum.metaCost || 0) })),
    })
  } catch (error) { return fail(error) }
}

export async function PUT(request: Request) {
  try {
    await admin(["SUPER_ADMIN"])
    const settings = settingsSchema.parse(await request.json())
    await saveMessagingSettings(settings)
    return NextResponse.json({ ok: true, message: "Messaging charge settings saved. They apply to the next message sent." })
  } catch (error) { return fail(error) }
}

// Set a workspace's option (null = platform default).
export async function PATCH(request: Request) {
  try {
    await admin(["SUPER_ADMIN"])
    const input = z.object({ organizationId: z.string().min(1), mode: z.enum(MODES).nullable() }).parse(await request.json())
    const settings = await getMessagingSettings()
    if (input.mode && !settings.enabledModes.includes(input.mode)) return NextResponse.json({ error: "Enable that option in the platform settings first." }, { status: 400 })
    await prisma.organization.update({ where: { id: input.organizationId }, data: { messagingBillingMode: input.mode } })
    return NextResponse.json({ ok: true, message: "Workspace charging option updated." })
  } catch (error) { return fail(error) }
}

// Manual wallet credit / debit (e.g. offline payment, goodwill credit, correction).
export async function POST(request: Request) {
  try {
    const user = await admin(["SUPER_ADMIN", "FINANCE"])
    const input = z.object({ organizationId: z.string().min(1), amount: z.number().refine(value => value !== 0, "Amount can't be zero.").refine(value => Math.abs(value) <= 1_000_000),
      reason: z.string().trim().min(3, "Give a reason (shown in the customer's wallet history).").max(200) }).parse(await request.json())
    const entry = await prisma.$transaction(tx => creditWallet(tx, { organizationId: input.organizationId, amount: input.amount, type: "ADJUSTMENT",
      reason: `Adjustment: ${input.reason}`, createdById: user.id }))
    return NextResponse.json({ ok: true, balance: Number(entry.balanceAfter), message: `Wallet ${input.amount > 0 ? "credited" : "debited"}. New balance ${Number(entry.balanceAfter).toFixed(2)}.` })
  } catch (error) { return fail(error) }
}
