import { NextResponse } from "next/server"
import { z } from "zod"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { cancelAutopay, startAutopay } from "@/lib/billing/autopay"

// Billing → "Pay & renew automatically" (UPI AutoPay / card via Razorpay) and "Turn off auto-renew". Owners/admins (see permissions).
export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("start"), subscriptionId: z.string().min(1) }),
      z.object({ action: z.literal("cancel") }),
    ]).parse(await request.json())
    if (input.action === "start") return NextResponse.json({ ok: true, ...(await startAutopay(organizationId, input.subscriptionId)) })
    const { endsAt } = await cancelAutopay(organizationId)
    return NextResponse.json({ ok: true, message: `Auto-renew is off. Your plan stays active until ${endsAt ? endsAt.toLocaleDateString("en-IN") : "the end of the period"}.` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Request failed" }, { status: errorStatus(error) })
  }
}
