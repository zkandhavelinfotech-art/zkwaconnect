import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { fail, sessionUser } from "@/lib/partners/http"
import { applyAsPartner, partnerClients, partnerForUser, wholesalePrice } from "@/lib/partners/partners"
import { brandForPartner, partnerBaseDomain } from "@/lib/partners/brand"


// Partner panel data: the partner account, its clients, money (wallet or earnings) and plan prices for it.
export async function GET() {
  try {
    const user = await sessionUser()
    const partner = await partnerForUser(user.id)
    if (!partner) {
      const workspaces = await prisma.membership.findMany({ where: { userId: user.id, role: "OWNER", status: "ACTIVE" }, select: { organization: { select: { id: true, name: true } } } })
      return NextResponse.json({ partner: null, workspaces: workspaces.map(item => item.organization), baseDomain: partnerBaseDomain() })
    }
    const [clients, ledger, plans, topups] = await Promise.all([
      partner.status === "ACTIVE" ? partnerClients(partner.id) : [],
      prisma.partnerLedger.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.plan.findMany({ where: { status: true, monthlyPrice: { gt: 0 } }, orderBy: { monthlyPrice: "asc" }, select: { id: true, name: true, monthlyPrice: true, annualPrice: true } }),
      prisma.invoice.findMany({ where: { organizationId: partner.organizationId, kind: "PARTNER_TOPUP" }, orderBy: { issuedAt: "desc" }, take: 10,
        include: { payments: { select: { status: true, transactionId: true }, orderBy: { createdAt: "desc" }, take: 1 } } }),
    ])
    const discount = Number(partner.discountPercent)
    return NextResponse.json({
      partner: { ...partner, walletBalance: Number(partner.walletBalance), discountPercent: discount, commissionPercent: Number(partner.commissionPercent) },
      brand: await brandForPartner(partner.id), baseDomain: partnerBaseDomain(), clients, ledger, topups,
      upi: { upiId: process.env.UPI_ID || "", payeeName: process.env.COMPANY_NAME || "ZKandavel Infotech" },
      plans: plans.map(plan => ({ ...plan, monthlyPrice: Number(plan.monthlyPrice), annualPrice: plan.annualPrice === null ? null : Number(plan.annualPrice),
        wholesaleMonthly: wholesalePrice(Number(plan.monthlyPrice), discount), wholesaleAnnual: plan.annualPrice === null ? null : wholesalePrice(Number(plan.annualPrice), discount) })),
      cnameTarget: (process.env.PARTNER_CNAME_TARGET || new URL(process.env.APP_URL || "https://app.zkwaconnect.in").host),
    })
  } catch (error) { return fail(error) }
}

// Apply to the partner programme (super admin approves and sets wholesale / commission).
export async function POST(request: Request) {
  try {
    const user = await sessionUser()
    const input = z.object({ organizationId: z.string().min(1), name: z.string().trim().min(2).max(80), slug: z.string().trim().toLowerCase(), note: z.string().trim().max(500).optional() }).parse(await request.json())
    await applyAsPartner(user.id, input)
    return NextResponse.json({ ok: true, message: "Application sent. We'll review it and switch on your partner panel." }, { status: 201 })
  } catch (error) { return fail(error) }
}
