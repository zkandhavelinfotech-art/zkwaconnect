import { NextResponse } from "next/server"
import { forgetPlanCache } from "@/lib/billing/limits"
import { z } from "zod"
import { prisma }        from "@/lib/db/prisma"
import { getSession }    from "@/lib/auth/session"
import { createGstInvoice } from "@/lib/billing/invoices"

async function assertAdmin() {
  const s = await getSession()
  if (!s?.user || !["SUPER_ADMIN","ADMIN","SUPPORT"].includes(s.user.adminRole))
    throw new Error("Admin access required")
  return s.user
}

export async function GET(req: Request) {
  try {
    await assertAdmin()
    const url  = new URL(req.url)
    const q    = url.searchParams.get("q") || ""
    const page = Math.max(1, Number(url.searchParams.get("page") || 1))
    const limit = 25

    const where: any = q ? {
      OR: [
        { name:  { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ]
    } : {}

    const [total, organizations, plans] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        include: {
          memberships:   { where: { role: "OWNER" }, include: { user: { select: { name:true, email:true } } }, take: 1 },
          subscriptions: { where: { status: { not: "PENDING_PAYMENT" } }, include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
          onboarding:    { select: { currentStep: true } },
          wabas: { include: { phoneNumbers: { select: { phoneNumber:true, status:true, qualityRating:true } } }, take: 3 },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.plan.findMany({ where: { status:true }, orderBy: { monthlyPrice:"asc" }, select: { id:true, name:true, monthlyPrice:true } }),
    ])
    return NextResponse.json({ organizations, plans, total, page, pages: Math.ceil(total / limit) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function PATCH(req: Request) {
  try {
    await assertAdmin()
    const input = z.object({
      id: z.string().min(1),
      action: z.enum(["suspend", "activate", "extend-trial", "assign-plan", "set-internal"]),
      internal: z.boolean().optional(),
      trialDays: z.number().int().min(1).max(365).optional(),
      planId: z.string().min(1).optional(),
    }).parse(await req.json())
    const { id, action, trialDays, planId } = input
    if (action === "set-internal") {
      const updated = await prisma.organization.update({ where: { id }, data: { billingExempt: Boolean(input.internal), ...(input.internal ? { status: "ACTIVE" } : {}) } })
      forgetPlanCache(id)
      return NextResponse.json({ ok: true, tenant: updated, message: input.internal ? "Marked internal: all features, no limits, no charges." : "Back on normal plans and limits." })
    }
    const org = await prisma.organization.findUnique({ where: { id } })
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (action === "suspend")
      return NextResponse.json({ org: await prisma.organization.update({ where:{id}, data:{status:"SUSPENDED"} }) })
    if (action === "activate")
      return NextResponse.json({ org: await prisma.organization.update({ where:{id}, data:{status:"ACTIVE"} }) })
    if (action === "extend-trial" && trialDays) {
      const sub = await prisma.subscription.findFirst({ where: { organizationId: id, status: "TRIAL" } })
      if (sub) {
        const d = new Date(sub.trialEndsAt || new Date())
        d.setDate(d.getDate() + trialDays)
        await prisma.subscription.update({ where: { id: sub.id }, data: { trialEndsAt: d } })
      }
      return NextResponse.json({ ok: true })
    }
    if (action === "assign-plan" && planId) {
      if (!org.billingAddress || !org.billingCity || !org.state || !org.billingPostalCode)
        return NextResponse.json({ error: "Tenant needs a complete billing profile before plan assignment." }, { status: 400 })
      const [plan, current] = await Promise.all([
        prisma.plan.findFirst({ where: { id: planId, status:true } }),
        prisma.subscription.findFirst({ where: { organizationId:id, status:{in:["TRIAL","ACTIVE","PAST_DUE"]} },
          include:{plan:true},orderBy:{createdAt:"desc"} }),
      ])
      if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 })
      if (current && Number(plan.monthlyPrice) <= Number(current.plan.monthlyPrice))
        return NextResponse.json({ error: "Select a higher-priced plan." }, { status: 400 })
      const start = new Date()
      const end = new Date(start)
      end.setMonth(end.getMonth() + 1)
      const result = await prisma.$transaction(async tx => {
        const subscription = await tx.subscription.create({
          data:{organizationId:id,planId:plan.id,status:"PAST_DUE",startDate:start,currentPeriodStart:start,currentPeriodEnd:end},
        })
        const invoice = await createGstInvoice(tx, org, subscription.id, Number(plan.monthlyPrice))
        return {subscription,invoice}
      })
      return NextResponse.json({ok:true,subscriptionId:result.subscription.id,
        invoice:{id:result.invoice.id,invoiceNumber:result.invoice.invoiceNumber,total:result.invoice.total}}, {status:201})
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
