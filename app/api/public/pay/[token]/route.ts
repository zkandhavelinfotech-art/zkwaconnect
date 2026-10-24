import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { normalizeUtr } from "@/lib/payments/upi"
import { notifyWorkspace } from "@/lib/payments/notify"
import { ThrottleError, assertNotLocked, clientIp, recordFailure } from "@/lib/auth/throttle"

// The payer tells the business "I've paid" with the UTR from their UPI app; the business then confirms it.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const { utr: raw } = z.object({ utr: z.string().trim().min(6).max(40) }).parse(await request.json())
    const limit = { key: `pay-utr:${await clientIp()}`, max: 10, windowMinutes: 60, lockMinutes: 60 }
    await assertNotLocked(limit)
    await recordFailure(limit)
    const utr = normalizeUtr(raw)
    if (!utr) return NextResponse.json({ error: "Enter the 12-digit UTR / UPI reference number from your UPI app's payment details." }, { status: 400 })
    const payment = await prisma.payment.findUnique({ where: { publicToken: token }, include: { contact: { select: { name: true, phone: true } } } })
    if (!payment || payment.method !== "UPI") return NextResponse.json({ error: "Payment request not found." }, { status: 404 })
    if (payment.status === "APPROVED") return NextResponse.json({ ok: true, status: "APPROVED", message: "This payment is already confirmed. Thank you!" })
    if (payment.status !== "PENDING") return NextResponse.json({ error: `This payment request is ${payment.status.toLowerCase()}. Please contact the business.` }, { status: 409 })
    // The same UTR can't be used for two payments of one business.
    const reused = await prisma.payment.findFirst({ where: { organizationId: payment.organizationId, utr, id: { not: payment.id } } })
    if (reused) return NextResponse.json({ error: "This UTR was already submitted for another payment." }, { status: 409 })
    await prisma.payment.update({ where: { id: payment.id }, data: { utr, submittedAt: new Date() } })
    await notifyWorkspace(payment.organizationId, "PAYMENT_UTR", `Check UPI payment of ₹${Number(payment.amount).toFixed(2)}`,
      `${payment.contact?.name || payment.contact?.phone || "A customer"} says they paid${payment.description ? ` for ${payment.description}` : ""}. UTR ${utr} — confirm it under Payments.`, "/app/payments", { paymentId: payment.id })
    return NextResponse.json({ ok: true, status: "SUBMITTED", message: "Thanks! The business will confirm your payment shortly and message you on WhatsApp." })
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Enter the UTR number." : error instanceof Error ? error.message : "Failed" }, { status: error instanceof ThrottleError ? 429 : 400 })
  }
}
