import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { settlePaymentLink } from "@/lib/billing/settle-payment"
import { markPaymentPaid } from "@/lib/payments/requests"
import { razorpaySignature, safeEqual, webhookSecretFor } from "@/lib/payments/webhook-secrets"
import { handleSubscriptionEvent } from "@/lib/billing/autopay"

export const runtime = "nodejs"

type Event = { event?: string; payload?: { payment_link?: { entity?: { id?: string; amount_paid?: number } }; subscription?: { entity?: { id?: string } }; payment?: { entity?: Record<string, unknown> } } }

// Razorpay → https://<domain>/api/webhooks/payments/razorpay (events: payment_link.paid, subscription.*)
export async function POST(request: NextRequest) {
  const raw = await request.text()
  const signature = request.headers.get("x-razorpay-signature")
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 401 })
  let event: Event
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }) }
  try {
    // Plan auto-renewals (platform's own Razorpay account).
    if (event.event?.startsWith("subscription.")) {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET
      if (!secret || !safeEqual(razorpaySignature(secret, raw), signature)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 })
      return NextResponse.json(await handleSubscriptionEvent(event))
    }
    if (event.event !== "payment_link.paid") return NextResponse.json({ received: true })
    const link = event.payload?.payment_link?.entity
    if (!link?.id || typeof link.amount_paid !== "number") return NextResponse.json({ error: "Invalid payment-link event." }, { status: 400 })
    const payment = await prisma.payment.findFirst({ where: { transactionId: link.id, method: "RAZORPAY" } })
    if (!payment) return NextResponse.json({ error: "Payment link not found." }, { status: 404 })
    const secret = await webhookSecretFor(payment, "RAZORPAY")
    if (!secret || !safeEqual(razorpaySignature(secret, raw), signature)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 })
    if (Math.round(Number(payment.amount) * 100) !== Math.round(link.amount_paid)) return NextResponse.json({ error: "Amount mismatch." }, { status: 400 })
    if (payment.contactId) return NextResponse.json({ received: true, ...(await markPaymentPaid(payment.id, { gateway: "Razorpay" })) })
    const result = await settlePaymentLink(link.id, "RAZORPAY", link.amount_paid)
    return NextResponse.json({ received: true, settled: result.settled })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not process payment event." }, { status: 400 }) }
}
