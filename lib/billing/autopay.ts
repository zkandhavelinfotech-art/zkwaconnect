import { prisma } from "@/lib/db/prisma"
import { activatePaidSubscription, addInterval, intervalLabel } from "@/lib/billing/activate"
import { createGstInvoice } from "@/lib/billing/invoices"
import { forgetPlanCache } from "@/lib/billing/limits"
import { notifyWorkspace } from "@/lib/payments/notify"
import { accrueCommission } from "@/lib/partners/partners"

// Automatic plan renewal with Razorpay Subscriptions (the platform's own Razorpay account): the customer approves
// a UPI AutoPay mandate or card once; every charge arrives as subscription.charged → GST invoice + payment + plan extended.
// Direct UPI can't debit automatically, so it stays the manual alternative.

const SETTING = "billing_options"
export type BillingOptions = { autopay: boolean }

export async function billingOptions(): Promise<BillingOptions> {
  const row = await prisma.platformSetting.findUnique({ where: { key: SETTING } })
  return { autopay: Boolean((row?.value as Partial<BillingOptions> | undefined)?.autopay) }
}
export async function saveBillingOptions(value: BillingOptions) {
  await prisma.platformSetting.upsert({ where: { key: SETTING }, update: { value }, create: { key: SETTING, value } })
}
export const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
export async function autopayAvailable() { return razorpayConfigured() && (await billingOptions()).autopay }

async function razorpay<T>(path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) })
  const result = await response.json() as T & { error?: { description?: string } }
  if (!response.ok) throw new Error(`Razorpay: ${result.error?.description || response.statusText}`)
  return result
}

// Razorpay needs a "plan" per price; created once per plan + interval + amount and remembered.
async function razorpayPlanId(plan: { id: string; name: string }, interval: string, amountPaise: number) {
  const key = `${plan.id}:${interval}:${amountPaise}`
  const row = await prisma.platformSetting.findUnique({ where: { key: "razorpay_plans" } })
  const map = (row?.value || {}) as Record<string, string>
  if (map[key]) return map[key]
  const created = await razorpay<{ id: string }>("plans", { period: interval === "ANNUAL" ? "yearly" : "monthly", interval: 1,
    item: { name: `ZKWAConnect ${plan.name} (${interval === "ANNUAL" ? "yearly" : "monthly"})`, amount: amountPaise, currency: "INR", description: "Includes GST" } })
  const value = { ...map, [key]: created.id }
  await prisma.platformSetting.upsert({ where: { key: "razorpay_plans" }, update: { value }, create: { key: "razorpay_plans", value } })
  return created.id
}

// Start auto-renew for a plan the customer chose (PENDING_PAYMENT subscription with a DUE invoice). Returns Razorpay's authorisation page.
export async function startAutopay(organizationId: string, subscriptionId: string) {
  if (!(await autopayAvailable())) throw new Error("Automatic renewal isn't available. Pay with UPI instead.")
  const subscription = await prisma.subscription.findFirst({ where: { id: subscriptionId, organizationId, status: "PENDING_PAYMENT" },
    include: { plan: true, invoices: { where: { status: "DUE" }, take: 1 } } })
  const invoice = subscription?.invoices[0]
  if (!subscription || !invoice) throw new Error("Choose a plan first.")
  const pendingUpi = await prisma.payment.count({ where: { invoiceId: invoice.id, status: "PENDING", transactionId: { not: null } } })
  if (pendingUpi) throw new Error("A UPI payment for this invoice is being verified.")
  const amountPaise = Math.round(Number(invoice.total) * 100)
  const planId = await razorpayPlanId(subscription.plan, subscription.billingInterval, amountPaise)
  const created = await razorpay<{ id: string; short_url: string }>("subscriptions", {
    plan_id: planId, total_count: subscription.billingInterval === "ANNUAL" ? 10 : 120, quantity: 1, customer_notify: 1,
    notes: { organizationId, subscriptionId: subscription.id, invoiceId: invoice.id },
  })
  await prisma.subscription.update({ where: { id: subscription.id }, data: { razorpaySubscriptionId: created.id } })
  return { url: created.short_url }
}

// Stop future charges (the current paid period stays).
export async function cancelAutopay(organizationId: string) {
  const subscription = await prisma.subscription.findFirst({ where: { organizationId, autoRenew: true, razorpaySubscriptionId: { not: null } }, orderBy: { createdAt: "desc" } })
  if (!subscription) throw new Error("Automatic renewal is not on.")
  await razorpay(`subscriptions/${subscription.razorpaySubscriptionId}/cancel`, { cancel_at_cycle_end: 0 }).catch(error => {
    if (!/cancelled|completed/i.test(String(error))) throw error
  })
  await prisma.subscription.update({ where: { id: subscription.id }, data: { autoRenew: false } })
  return { endsAt: subscription.currentPeriodEnd }
}

type SubscriptionEvent = { event?: string; payload?: { subscription?: { entity?: { id?: string } }; payment?: { entity?: Record<string, unknown> } } }

export async function handleSubscriptionEvent(event: SubscriptionEvent) {
  const razorpayId = event.payload?.subscription?.entity?.id
  if (!razorpayId) return { received: true }
  const subscription = await prisma.subscription.findUnique({ where: { razorpaySubscriptionId: razorpayId }, include: { plan: true, organization: true } })
  if (!subscription) return { received: true, unknown: true }

  if (event.event === "subscription.charged") {
    const charge = event.payload?.payment?.entity as { id?: string; amount?: number; method?: string } | undefined
    if (!charge?.id || typeof charge.amount !== "number") return { received: true }
    // Razorpay retries webhooks: one payment record per Razorpay payment.
    if (await prisma.payment.findFirst({ where: { transactionId: charge.id, method: "RAZORPAY" } })) return { received: true, duplicate: true }
    const amount = charge.amount / 100
    const now = new Date()
    await prisma.$transaction(async tx => {
      const firstCharge = subscription.status === "PENDING_PAYMENT"
      let invoiceId: string
      if (firstCharge) {
        const invoice = await tx.invoice.findFirst({ where: { subscriptionId: subscription.id, status: "DUE" }, orderBy: { issuedAt: "desc" } })
        invoiceId = invoice?.id || (await createGstInvoice(tx, subscription.organization, subscription.id, Math.round(amount / (1 + gst()) * 100) / 100,
          `ZKWAConnect ${subscription.plan.name} plan — ${intervalLabel(subscription.billingInterval)}`)).id
      } else {
        invoiceId = (await createGstInvoice(tx, subscription.organization, subscription.id, Math.round(amount / (1 + gst()) * 100) / 100,
          `ZKWAConnect ${subscription.plan.name} plan — ${intervalLabel(subscription.billingInterval)} (auto-renewal)`)).id
      }
      const payment = await tx.payment.create({ data: { organizationId: subscription.organizationId, subscriptionId: subscription.id, invoiceId, amount,
        method: "RAZORPAY", transactionId: charge.id, status: "APPROVED", submittedAt: now, verifiedAt: now, verifiedBy: "Razorpay AutoPay",
        description: `Auto-renewal${charge.method ? ` (${charge.method})` : ""}` } })
      if (firstCharge) {
        await activatePaidSubscription(tx, payment, now)
        await tx.subscription.update({ where: { id: subscription.id }, data: { autoRenew: true } })
      } else {
        const paid = await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: now } })
        await accrueCommission(tx, subscription.organizationId, paid)
        const from = subscription.currentPeriodEnd && subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now
        await tx.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", currentPeriodStart: from, currentPeriodEnd: addInterval(from, subscription.billingInterval), autoRenew: true } })
      }
    })
    forgetPlanCache(subscription.organizationId)
    await notifyWorkspace(subscription.organizationId, "PAYMENT_APPROVED", `${subscription.plan.name} plan ${subscription.status === "PENDING_PAYMENT" ? "activated" : "renewed"}`,
      `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} charged automatically by Razorpay. Your GST invoice is under Billing.`, "/app/billing")
    return { received: true, charged: true }
  }

  if (["subscription.halted", "subscription.cancelled", "subscription.completed", "subscription.paused"].includes(event.event || "")) {
    if (subscription.autoRenew) {
      await prisma.subscription.update({ where: { id: subscription.id }, data: { autoRenew: false } })
      await notifyWorkspace(subscription.organizationId, "AUTOPAY_STOPPED", "Automatic renewal stopped",
        event.event === "subscription.halted" ? "Razorpay couldn't charge your UPI AutoPay / card. Renew under Billing so your plan doesn't expire." : `Your ${subscription.plan.name} plan will not renew automatically. Renew under Billing before it ends.`, "/app/billing")
    }
    return { received: true }
  }
  return { received: true }
}

const gst = () => Number(process.env.GST_RATE || 18) / 100
