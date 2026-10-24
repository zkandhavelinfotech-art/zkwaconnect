import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { settlePaymentLink } from "@/lib/billing/settle-payment"
import { markPaymentPaid } from "@/lib/payments/requests"
import { cashfreeSignature, safeEqual, webhookSecretFor } from "@/lib/payments/webhook-secrets"

export const runtime = "nodejs"

// Cashfree → https://<domain>/api/webhooks/payments/cashfree (payment link events)
export async function POST(request: NextRequest) {
  const raw = await request.text()
  const signature = request.headers.get("x-webhook-signature")
  const timestamp = request.headers.get("x-webhook-timestamp")
  if (!signature || !timestamp) return NextResponse.json({ error: "Missing signature." }, { status: 401 })
  try {
    const event = JSON.parse(raw) as { type?: string; data?: { link_id?: string; link_status?: string; link_amount_paid?: number; payment?: { payment_amount?: number } } }
    const data = event.data
    if (!data?.link_id || data.link_status?.toUpperCase() !== "PAID") return NextResponse.json({ received: true })
    const payment = await prisma.payment.findFirst({ where: { transactionId: data.link_id, method: "CASHFREE" } })
    if (!payment) return NextResponse.json({ error: "Payment link not found." }, { status: 404 })
    const secret = await webhookSecretFor(payment, "CASHFREE")
    if (!secret || !safeEqual(cashfreeSignature(secret, timestamp, raw), signature)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 })
    const amount = Number(data.link_amount_paid ?? data.payment?.payment_amount)
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(Number(payment.amount) * 100)) return NextResponse.json({ error: "Amount mismatch." }, { status: 400 })
    if (payment.contactId) return NextResponse.json({ received: true, ...(await markPaymentPaid(payment.id, { gateway: "Cashfree" })) })
    const result = await settlePaymentLink(data.link_id, "CASHFREE", Math.round(amount * 100))
    return NextResponse.json({ received: true, settled: result.settled })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not process Cashfree payment event." }, { status: 400 }) }
}
