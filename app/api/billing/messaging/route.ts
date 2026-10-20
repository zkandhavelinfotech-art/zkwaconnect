import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { createGstInvoice } from "@/lib/billing/invoices"
import { CATEGORIES, compareCosts, effectiveMode, getMessagingSettings, MODE_INFO, MODES, priceOf, templateUsage } from "@/lib/billing/messaging"

// The workspace's messaging charges: current option, rates, wallet, ledger and a cost comparison.
export async function GET() {
  try {
    const { organizationId } = await requireMember()
    const [settings, org, transactions, usage] = await Promise.all([
      getMessagingSettings(),
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { messagingBillingMode: true, walletBalance: true, currency: true } }),
      prisma.walletTransaction.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 50,
        select: { id: true, type: true, amount: true, balanceAfter: true, reason: true, category: true, createdAt: true } }),
      templateUsage(organizationId, 30),
    ])
    const mode = effectiveMode(settings, org.messagingBillingMode)
    // Customers compare every option the admin allows them to see (or at least their own).
    const visible = settings.showComparisonToCustomers ? MODES.filter(item => settings.enabledModes.includes(item)) : [mode]
    const prices = Object.fromEntries(MODES.map(item => [item, Object.fromEntries(CATEGORIES.map(category => [category, priceOf(settings, item, category)]))]))
    return NextResponse.json({
      mode, modeInfo: MODE_INFO[mode], usesWallet: mode !== "DIRECT", currency: org.currency, balance: Number(org.walletBalance),
      minTopup: settings.minTopup, lowBalanceThreshold: settings.lowBalanceThreshold, ratesNote: settings.ratesNote,
      options: visible.map(item => ({ mode: item, ...MODE_INFO[item], prices: prices[item] })),
      usage, comparison: compareCosts(settings, usage, visible),
      transactions: transactions.map(row => ({ ...row, amount: Number(row.amount), balanceAfter: Number(row.balanceAfter) })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) })
  }
}

// Top up the wallet: creates a GST invoice paid by UPI like plan invoices; credits arrive when the payment is approved.
export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const [settings, organization] = await Promise.all([getMessagingSettings(), prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })])
    const mode = effectiveMode(settings, organization.messagingBillingMode)
    if (mode === "DIRECT") return NextResponse.json({ error: "Your workspace pays Meta directly, so there's no wallet to top up." }, { status: 409 })
    const { amount } = z.object({ amount: z.number().int("Use whole rupees.").min(settings.minTopup, `The minimum top-up is ${organization.currency} ${settings.minTopup}.`).max(500000) })
      .parse(await request.json())
    if (!organization.billingAddress || !organization.billingCity || !organization.state || !organization.billingPostalCode)
      return NextResponse.json({ error: "Save your billing details (Billing page) before topping up — they're printed on the GST invoice." }, { status: 400 })
    const open = await prisma.invoice.count({ where: { organizationId, kind: "WALLET_TOPUP", status: "DUE", payments: { some: { status: "PENDING" } } } })
    if (open >= 3) return NextResponse.json({ error: "You already have top-ups waiting for verification. Wait for them to be approved." }, { status: 409 })
    const invoice = await prisma.$transaction(tx => createGstInvoice(tx, organization, null, amount, `WhatsApp message credits (${MODE_INFO[mode].short})`, "WALLET_TOPUP"))
    return NextResponse.json({ invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total },
      message: `Invoice ${invoice.invoiceNumber} created. Pay it by UPI below — ${organization.currency} ${amount} of credits are added once the payment is approved.` }, { status: 201 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed"
    return NextResponse.json({ error: message }, { status: errorStatus(error) })
  }
}
