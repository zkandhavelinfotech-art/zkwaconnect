import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { billingOptions, razorpayConfigured, saveBillingOptions } from "@/lib/billing/autopay"
import { publicUrl } from "@/lib/payments/requests"

async function superAdmin() {
  const session = await getSession()
  if (session?.user.adminRole !== "SUPER_ADMIN") throw Object.assign(new Error("Super admin access required."), { status: 403 })
}
const fail = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: (error as { status?: number }).status || 400 })

// How customers can pay for plans: direct UPI (always) and Razorpay auto-renewal (optional).
export async function GET() {
  try {
    await superAdmin()
    return NextResponse.json({ ...(await billingOptions()), razorpayConfigured: razorpayConfigured(), upiConfigured: Boolean(process.env.UPI_ID),
      webhook: publicUrl("/api/webhooks/payments/razorpay") })
  } catch (error) { return fail(error) }
}

export async function PUT(request: Request) {
  try {
    await superAdmin()
    const { autopay } = z.object({ autopay: z.boolean() }).parse(await request.json())
    if (autopay && !razorpayConfigured()) throw new Error("Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server first.")
    await saveBillingOptions({ autopay })
    return NextResponse.json({ ok: true, message: autopay ? "Customers can now pay with automatic renewal." : "Automatic renewal is off for new purchases." })
  } catch (error) { return fail(error) }
}
