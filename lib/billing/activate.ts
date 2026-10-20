import { Prisma } from "@/generated/prisma/client"
import { forgetPlanCache } from "./limits"
import { creditWallet } from "@/lib/billing/messaging"
import { prisma } from "@/lib/db/prisma"

export type BillingInterval = "MONTHLY" | "ANNUAL"

export function addInterval(start: Date, interval: string) {
  const end = new Date(start)
  if (interval === "ANNUAL") end.setFullYear(end.getFullYear() + 1)
  else end.setMonth(end.getMonth() + 1)
  return end
}

export function intervalLabel(interval: string) {
  return interval === "ANNUAL" ? "12 months" : "1 month"
}

// Approve a plan payment: mark the invoice paid, start the paid period and retire the trial / previous plan.
// Renewing the same plan while it is still active extends it from its current end date.
export async function activatePaidSubscription(tx: Prisma.TransactionClient, payment: { organizationId: string; subscriptionId: string | null; invoiceId: string | null }, now = new Date()) {
  if (payment.invoiceId) {
    const invoice = await tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: "PAID", paidAt: now } })
    // Wallet top-up: the credits are the invoice amount before GST.
    if (invoice.kind === "WALLET_TOPUP") {
      await creditWallet(tx, { organizationId: payment.organizationId, amount: Number(invoice.amount), type: "TOPUP", reason: `Top-up · invoice ${invoice.invoiceNumber}`, invoiceId: invoice.id })
      return null
    }
  }
  if (!payment.subscriptionId) return null
  const subscription = await tx.subscription.findUnique({ where: { id: payment.subscriptionId } })
  if (!subscription) return null
  const previous = await tx.subscription.findFirst({
    where: { organizationId: payment.organizationId, id: { not: subscription.id }, status: "ACTIVE", planId: subscription.planId, currentPeriodEnd: { gt: now } },
    orderBy: { currentPeriodEnd: "desc" },
  })
  const start = previous?.currentPeriodEnd || now
  const activated = await tx.subscription.update({ where: { id: subscription.id }, data: {
    status: "ACTIVE", startDate: previous?.startDate || now, currentPeriodStart: start, currentPeriodEnd: addInterval(start, subscription.billingInterval), trialEndsAt: null,
  } })
  await tx.subscription.updateMany({
    where: { organizationId: payment.organizationId, id: { not: subscription.id }, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE", "PENDING_PAYMENT"] } },
    data: { status: "CANCELLED", cancelledAt: now },
  })
  await tx.organization.updateMany({ where: { id: payment.organizationId, status: "TRIAL" }, data: { status: "ACTIVE" } })
  forgetPlanCache(payment.organizationId)
  return activated
}

// Trials and paid periods that have run out are marked EXPIRED (checked lazily when the app loads).
export async function expireLapsedSubscriptions(organizationId: string, now = new Date()) {
  await prisma.subscription.updateMany({
    where: { organizationId, status: { in: ["TRIAL", "ACTIVE"] }, currentPeriodEnd: { lt: now } },
    data: { status: "EXPIRED" },
  })
}
