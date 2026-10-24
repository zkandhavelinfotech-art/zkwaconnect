import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { postLedger } from "@/lib/partners/partners"
import { forgetBrand } from "@/lib/partners/brand"

async function superAdmin() {
  const session = await getSession()
  if (session?.user.adminRole !== "SUPER_ADMIN") throw Object.assign(new Error("Super admin access required."), { status: 403 })
  return session.user
}
const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" }, { status: (error as { status?: number }).status || 400 })

export async function GET() {
  try {
    await superAdmin()
    const partners = await prisma.partner.findMany({ orderBy: { createdAt: "desc" }, include: { members: true, ledger: { orderBy: { createdAt: "desc" }, take: 10 } } })
    const users = await prisma.user.findMany({ where: { id: { in: partners.flatMap(partner => partner.members.map(member => member.userId)) } }, select: { id: true, name: true, email: true } })
    const counts = await prisma.organization.groupBy({ by: ["partnerId"], where: { partnerId: { in: partners.map(partner => partner.id) } }, _count: true })
    return NextResponse.json({ partners: partners.map(partner => ({ ...partner, walletBalance: Number(partner.walletBalance), discountPercent: Number(partner.discountPercent), commissionPercent: Number(partner.commissionPercent),
      clients: counts.find(row => row.partnerId === partner.id)?._count || 0,
      owners: partner.members.map(member => users.find(user => user.id === member.userId)).filter(Boolean),
      ledger: partner.ledger.map(row => ({ ...row, amount: Number(row.amount), balanceAfter: Number(row.balanceAfter) })) })) })
  } catch (error) { return fail(error) }
}

// Approve / suspend, programme (wholesale or commission) and its %, own-domain approval.
export async function PUT(request: Request) {
  try {
    await superAdmin()
    const input = z.object({ id: z.string().min(1), status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]).optional(), model: z.enum(["WHOLESALE", "COMMISSION"]).optional(),
      discountPercent: z.number().min(0).max(90).optional(), commissionPercent: z.number().min(0).max(90).optional(), domainVerified: z.boolean().optional() }).parse(await request.json())
    const partner = await prisma.partner.findUniqueOrThrow({ where: { id: input.id } })
    await prisma.partner.update({ where: { id: input.id }, data: {
      ...(input.status ? { status: input.status, ...(input.status === "ACTIVE" && !partner.approvedAt ? { approvedAt: new Date() } : {}) } : {}),
      ...(input.model ? { model: input.model } : {}), ...(input.discountPercent !== undefined ? { discountPercent: input.discountPercent } : {}),
      ...(input.commissionPercent !== undefined ? { commissionPercent: input.commissionPercent } : {}),
      ...(input.domainVerified !== undefined ? { domainVerifiedAt: input.domainVerified ? new Date() : null } : {}) } })
    forgetBrand()
    return NextResponse.json({ ok: true, message: "Partner updated." })
  } catch (error) { return fail(error) }
}

// Money: record a commission payout (−) or a wallet adjustment (±).
export async function POST(request: Request) {
  try {
    const admin = await superAdmin()
    const input = z.object({ id: z.string().min(1), type: z.enum(["PAYOUT", "ADJUSTMENT"]), amount: z.number().refine(value => value !== 0), note: z.string().trim().min(3).max(200) }).parse(await request.json())
    const amount = input.type === "PAYOUT" ? -Math.abs(input.amount) : input.amount
    await prisma.$transaction(tx => postLedger(tx, { partnerId: input.id, type: input.type, amount, description: `${input.note} (by ${admin.email})` }))
    return NextResponse.json({ ok: true, message: input.type === "PAYOUT" ? "Payout recorded." : "Balance adjusted." })
  } catch (error) { return fail(error) }
}
