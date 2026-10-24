import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { paymentAccounts } from "@/lib/payments/accounts"
import { createPaymentRequest, reviewPayment } from "@/lib/payments/requests"

export const runtime = "nodejs"
const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Request failed" }, { status: errorStatus(error) })

export async function GET() {
  try {
    const { organizationId } = await requireMember()
    const [contacts, payments, accounts] = await Promise.all([
      // Payment requests are replies in the chat, so marketing opt-in isn't required.
      prisma.contact.findMany({ where: { organizationId, NOT: { phone: { startsWith: "ig:" } } }, select: { id: true, name: true, phone: true, email: true }, orderBy: { updatedAt: "desc" }, take: 500 }),
      prisma.payment.findMany({ where: { organizationId, contactId: { not: null } }, include: { contact: { select: { name: true, phone: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      paymentAccounts(organizationId),
    ])
    return NextResponse.json({ contacts, payments, providers: { UPI: Boolean(accounts.UPI), RAZORPAY: Boolean(accounts.RAZORPAY), CASHFREE: Boolean(accounts.CASHFREE), WHATSAPP_PAY: Boolean(accounts.WHATSAPP_PAY) },
      awaiting: payments.filter(payment => payment.status === "PENDING" && payment.utr).length })
  } catch (error) { return fail(error) }
}

const createSchema = z.object({
  contactId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  description: z.string().trim().min(3).max(180),
  method: z.enum(["UPI", "RAZORPAY", "CASHFREE", "WHATSAPP_PAY"]),
  orderId: z.string().min(1).optional(),
})

export async function POST(request: Request) {
  try {
    const { organizationId, userId } = await requireMember()
    const input = createSchema.parse(await request.json())
    const result = await createPaymentRequest(organizationId, { ...input, senderUserId: userId })
    return NextResponse.json({ ok: true, paymentId: result.payment.id, linkUrl: result.url, whatsappSent: result.sent,
      message: result.sent ? "Payment request sent on WhatsApp." : input.method === "WHATSAPP_PAY" ? `Not sent: ${result.reason}` : `Payment link created. ${result.reason}` }, { status: 201 })
  } catch (error) { return fail(error) }
}

// Confirm or reject a direct-UPI payment after checking the UTR in your bank / UPI app.
export async function PATCH(request: Request) {
  try {
    const { organizationId, userId, role } = await requireMember()
    if (!["OWNER", "ADMIN", "MANAGER"].includes(role)) throw Object.assign(new Error("Only owners, admins and managers can confirm payments."), { status: 403 })
    const input = z.object({ id: z.string().min(1), action: z.enum(["confirm", "reject"]), reason: z.string().trim().max(200).optional() }).parse(await request.json())
    const result = await reviewPayment(organizationId, input.id, input.action, userId, input.reason)
    return NextResponse.json({ ok: true, ...result, message: result.status === "APPROVED" ? "Payment confirmed. The customer was thanked on WhatsApp (if the chat is open)." : "Payment rejected." })
  } catch (error) { return fail(error) }
}
