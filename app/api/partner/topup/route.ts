import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { createGstInvoice } from "@/lib/billing/invoices"
import { normalizeUtr } from "@/lib/payments/upi"
import { requirePartner } from "@/lib/partners/partners"
import { fail, sessionUser } from "@/lib/partners/http"

// Wholesale partners top up their wallet: a GST invoice paid by UPI, approved by the super admin like plan payments.
export async function POST(request: Request) {
  try {
    const user = await sessionUser()
    const partner = await requirePartner(user.id, { active: true, owner: true })
    if (partner.model !== "WHOLESALE") throw new Error("Only wholesale partners have a wallet.")
    const { amount } = z.object({ amount: z.number().min(500, "Minimum top-up is ₹500.").max(1_000_000) }).parse(await request.json())
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: partner.organizationId } })
    if (!org.billingAddress || !org.billingCity || !org.state || !org.billingPostalCode) throw new Error("Fill in the billing profile of your partner workspace (Billing → Billing details) first — it goes on the GST invoice.")
    const invoice = await prisma.$transaction(tx => createGstInvoice(tx, org, null, amount, `ZKWAConnect partner wallet top-up`, "PARTNER_TOPUP"))
    return NextResponse.json({ ok: true, invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, total: Number(invoice.total) } }, { status: 201 })
  } catch (error) { return fail(error) }
}

// "I've paid" with the UTR; the super admin approves it under Payments.
export async function PUT(request: Request) {
  try {
    const user = await sessionUser()
    const partner = await requirePartner(user.id, { active: true, owner: true })
    const input = z.object({ invoiceId: z.string().min(1), utr: z.string().trim().min(6).max(40) }).parse(await request.json())
    const utr = normalizeUtr(input.utr)
    if (!utr) throw new Error("Enter the 12-digit UTR / UPI reference number.")
    const invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, organizationId: partner.organizationId, kind: "PARTNER_TOPUP", status: "DUE" } })
    if (!invoice) throw new Error("Invoice not found or already paid.")
    if (await prisma.payment.count({ where: { invoiceId: invoice.id, status: "PENDING" } })) throw new Error("A payment for this invoice is already being verified.")
    await prisma.payment.create({ data: { organizationId: partner.organizationId, invoiceId: invoice.id, amount: invoice.total, method: "UPI", upiId: process.env.UPI_ID,
      transactionId: utr, status: "PENDING", submittedAt: new Date(), description: "Partner wallet top-up" } })
    return NextResponse.json({ ok: true, message: "Thanks! Your wallet is credited once we confirm the payment (usually within a few hours)." })
  } catch (error) { return fail(error) }
}
