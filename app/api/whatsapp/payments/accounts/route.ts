import { NextResponse } from "next/server"
import { z } from "zod"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { accountSummary, isUpiId, removePaymentAccount, savePaymentAccount } from "@/lib/payments/accounts"
import { WHATSAPP_PAY_GATEWAYS } from "@/lib/payments/whatsapp-pay"
import { publicUrl } from "@/lib/payments/requests"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Request failed" }, { status: errorStatus(error) })

// The workspace's own collection accounts (owners/admins; see permissions). Secrets are write-only.
export async function GET() {
  try {
    const { organizationId } = await requireMember()
    return NextResponse.json({ accounts: await accountSummary(organizationId), webhooks: {
      RAZORPAY: publicUrl("/api/webhooks/payments/razorpay"), CASHFREE: publicUrl("/api/webhooks/payments/cashfree") } })
  } catch (error) { return fail(error) }
}

const schema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("UPI"), upiId: z.string().trim().refine(isUpiId, "Enter a valid UPI ID, e.g. yourbusiness@okhdfcbank"), payeeName: z.string().trim().min(2).max(50) }),
  z.object({ provider: z.literal("RAZORPAY"), keyId: z.string().trim().regex(/^rzp_(live|test)_[A-Za-z0-9]{8,}$/, "Razorpay key IDs look like rzp_live_…"),
    keySecret: z.string().trim().max(200).optional(), webhookSecret: z.string().trim().max(200).optional() }),
  z.object({ provider: z.literal("CASHFREE"), clientId: z.string().trim().min(4).max(200), clientSecret: z.string().trim().max(300).optional(),
    webhookSecret: z.string().trim().max(300).optional(), production: z.boolean().default(true) }),
  z.object({ provider: z.literal("WHATSAPP_PAY"), configurationName: z.string().trim().min(1, "Enter the payment configuration name from WhatsApp Manager.").max(60), gateway: z.enum(WHATSAPP_PAY_GATEWAYS) }),
])

export async function PUT(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const input = schema.parse(await request.json())
    if (input.provider === "UPI") await savePaymentAccount(organizationId, "UPI", { upiId: input.upiId.toLowerCase(), payeeName: input.payeeName })
    if (input.provider === "RAZORPAY") await savePaymentAccount(organizationId, "RAZORPAY", { keyId: input.keyId }, { keySecret: input.keySecret || "", webhookSecret: input.webhookSecret || "" })
    if (input.provider === "WHATSAPP_PAY") await savePaymentAccount(organizationId, "WHATSAPP_PAY", { configurationName: input.configurationName, gateway: input.gateway })
    if (input.provider === "CASHFREE") await savePaymentAccount(organizationId, "CASHFREE", { clientId: input.clientId, production: input.production }, { clientSecret: input.clientSecret || "", webhookSecret: input.webhookSecret || "" })
    return NextResponse.json({ ok: true, message: "Payment account saved." })
  } catch (error) { return fail(error) }
}

export async function DELETE(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const provider = z.enum(["UPI", "RAZORPAY", "CASHFREE", "WHATSAPP_PAY"]).parse(new URL(request.url).searchParams.get("provider"))
    await removePaymentAccount(organizationId, provider)
    return NextResponse.json({ ok: true, message: "Payment account removed." })
  } catch (error) { return fail(error) }
}
