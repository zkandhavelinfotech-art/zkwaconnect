import { NextResponse } from "next/server"
import { featuresOf } from "@/lib/billing/features"
import { planState } from "@/lib/billing/limits"
import { z } from "zod"
import { prisma }        from "@/lib/db/prisma"
import { getSession }    from "@/lib/auth/session"
import { createGstInvoice } from "@/lib/billing/invoices"
import { stateByCode, stateByName } from "@/lib/billing/states"
import { addInterval, expireLapsedSubscriptions, intervalLabel } from "@/lib/billing/activate"

async function getOrganization() {
  const session = await getSession()
  const membership = session?.user.memberships.find(item => item.status === "ACTIVE")
  if (!membership) return null
  return prisma.organization.findUnique({ where: { id: membership.organizationId } })
}

export async function GET() {
  try {
    const organization = await getOrganization()
    if (!organization) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await expireLapsedSubscriptions(organization.id)
    const [subscription, pending, invoices, payments, plans] = await Promise.all([
      prisma.subscription.findFirst({
        where: { organizationId: organization.id, status: { not: "PENDING_PAYMENT" } }, include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.subscription.findFirst({
        where: { organizationId: organization.id, status: "PENDING_PAYMENT", invoices: { some: { status: "DUE" } } },
        include: { plan: true, invoices: { where: { status: "DUE" }, take: 1 } }, orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.findMany({ where: { organizationId: organization.id }, orderBy: { issuedAt: "desc" }, take: 12 }),
      prisma.payment.findMany({
        where: { organizationId: organization.id },
        include: { invoice: { select: { invoiceNumber: true } } },
        orderBy: { createdAt: "desc" }, take: 10,
      }),
      prisma.plan.findMany({ where: { status: true }, orderBy: { monthlyPrice: "asc" } }),
    ])
    return NextResponse.json({
      subscription, invoices, payments,
      plans: plans.map(plan => ({ ...plan, features: featuresOf(plan) })),
      usage: await planState(organization.id).then(state => ({ limits: state.limits, usage: state.usage, active: state.active, onFree: state.onFree, internal: state.internal,
        planName: state.planName, planSlug: state.planSlug, features: state.features })),
      pending: pending && { id: pending.id, plan: pending.plan, billingInterval: pending.billingInterval, invoice: pending.invoices[0] },
      billingProfile: {
        legalName: organization.legalName || organization.name,
        gstin: organization.gstin || "",
        billingAddress: organization.billingAddress || "",
        billingCity: organization.billingCity || "",
        state: organization.state || "",
        billingStateCode: organization.billingStateCode || "",
        billingPostalCode: organization.billingPostalCode || "",
      },
      paymentDetails: {
        upiId: process.env.UPI_ID || "",
        payeeName: process.env.COMPANY_NAME || "ZKandhavel Infotech Pvt. Ltd.",
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

const profileSchema = z.object({
  legalName: z.string().trim().min(2, "Enter your legal or business name.").max(120, "Legal name is too long."),
  gstin: z.string().trim().max(15, "GSTIN has 15 characters.").transform(value => value.toUpperCase()).refine(
    value => value === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value),
    "Enter a valid 15-character GSTIN or leave it blank.",
  ),
  billingAddress: z.string().trim().min(3, "Enter your billing address.").max(240, "Billing address is too long."),
  billingCity: z.string().trim().min(2, "Enter your city.").max(80, "City is too long."),
  state: z.string().trim().min(2, "Choose your state."),
  billingStateCode: z.string().trim().default(""),
  billingPostalCode: z.string().trim().regex(/^\d{6}$/, "Enter your 6-digit PIN code."),
}).transform((profile, ctx) => {
  const state = stateByName(profile.state) || stateByCode(profile.billingStateCode)
  if (!state) { ctx.addIssue({ code: "custom", path: ["state"], message: "Choose your state from the list." }); return z.NEVER }
  if (profile.gstin && profile.gstin.slice(0, 2) !== state.code) {
    ctx.addIssue({ code: "custom", path: ["gstin"], message: `This GSTIN is registered in ${stateByCode(profile.gstin.slice(0, 2))?.name || "another state"}, not ${state.name}. Check the state or GSTIN.` })
    return z.NEVER
  }
  return { ...profile, state: state.name, billingStateCode: state.code }
})

export async function PATCH(request: Request) {
  try {
    const organization = await getOrganization()
    if (!organization) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const profile = profileSchema.parse(await request.json())
    const updated = await prisma.organization.update({
      where: { id: organization.id },
      data: { ...profile, gstin: profile.gstin || null },
    })
    return NextResponse.json({ ok: true, legalName: updated.legalName, gstin: updated.gstin })
  } catch (e) {
    if (e instanceof z.ZodError) {
      const fields = Object.fromEntries(e.issues.map(issue => [String(issue.path[0]), issue.message]))
      return NextResponse.json({ error: e.issues.length > 1 ? "Please complete your billing details (highlighted below)." : e.issues[0].message, fields }, { status: 400 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save billing profile." }, { status: 400 })
  }
}

const purchaseSchema = z.object({ planId: z.string().min(1), interval: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY") })

// Buy, renew or upgrade a plan: creates a GST invoice and a PENDING_PAYMENT subscription that
// becomes active once the UPI payment is approved (the current plan stays as it is until then).
export async function POST(request: Request) {
  try {
    const organization = await getOrganization()
    if (!organization) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!organization.billingAddress || !organization.billingCity || !organization.state || !organization.billingPostalCode)
      return NextResponse.json({ error: "Save your complete billing profile before buying a plan." }, { status: 400 })

    const { planId, interval } = purchaseSchema.parse(await request.json())
    const [plan, current, pending] = await Promise.all([
      prisma.plan.findFirst({ where: { id: planId, status: true } }),
      prisma.subscription.findFirst({
        where: { organizationId: organization.id, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
        include: { plan: true }, orderBy: { createdAt: "desc" },
      }),
      prisma.subscription.findFirst({
        where: { organizationId: organization.id, status: "PENDING_PAYMENT" },
        include: { invoices: { where: { status: "DUE" }, include: { payments: { where: { status: "PENDING" } } } } }, orderBy: { createdAt: "desc" },
      }),
    ])
    if (!plan) return NextResponse.json({ error: "Plan not found or unavailable." }, { status: 404 })
    const price = interval === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice
    if (price === null || Number(price) <= 0) return NextResponse.json({ error: `${plan.name} isn't available with ${interval === "ANNUAL" ? "yearly" : "monthly"} billing.` }, { status: 400 })
    if (current?.status === "ACTIVE" && Number(plan.monthlyPrice) < Number(current.plan.monthlyPrice))
      return NextResponse.json({ error: `You're on ${current.plan.name}. Moving to a smaller plan is possible when it ends on ${current.currentPeriodEnd?.toLocaleDateString("en-IN") || "renewal"} — contact support.` }, { status: 400 })

    // Re-use the open invoice for the same choice; replace one for a different choice unless it's being verified.
    const openInvoice = pending?.invoices[0]
    if (pending && openInvoice) {
      if (pending.planId === plan.id && pending.billingInterval === interval)
        return NextResponse.json({ ok: true, reused: true, subscriptionId: pending.id,
          invoice: { id: openInvoice.id, invoiceNumber: openInvoice.invoiceNumber, total: openInvoice.total } })
      if (openInvoice.payments.length)
        return NextResponse.json({ error: `Invoice ${openInvoice.invoiceNumber} has a payment being verified. Wait for it to be approved or rejected before choosing another plan.` }, { status: 409 })
    }

    const now = new Date()
    const renewal = current?.status === "ACTIVE" && current.planId === plan.id && current.currentPeriodEnd && current.currentPeriodEnd > now
    const periodStart = renewal ? current.currentPeriodEnd! : now
    const description = `ZKWAConnect ${plan.name} plan — ${intervalLabel(interval)}${renewal ? " (renewal)" : ""}`
    const result = await prisma.$transaction(async tx => {
      // The abandoned choice stays PENDING_PAYMENT (never shown as the current plan); only its invoice is voided.
      if (pending) {
        await tx.invoice.updateMany({ where: { subscriptionId: pending.id, status: "DUE" }, data: { status: "CANCELLED" } })
      }
      const subscription = await tx.subscription.create({
        data: {
          organizationId: organization.id, planId: plan.id, status: "PENDING_PAYMENT", billingInterval: interval,
          startDate: now, currentPeriodStart: periodStart, currentPeriodEnd: addInterval(periodStart, interval),
        },
      })
      const invoice = await createGstInvoice(tx, organization, subscription.id, Number(price), description)
      return { subscription, invoice }
    })

    return NextResponse.json({
      ok: true,
      subscriptionId: result.subscription.id,
      invoice: { id: result.invoice.id, invoiceNumber: result.invoice.invoiceNumber, total: result.invoice.total },
    }, { status: 201 })
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not create the invoice."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
