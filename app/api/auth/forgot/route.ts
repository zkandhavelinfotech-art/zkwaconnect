import { NextResponse } from "next/server"
import { z } from "zod"
import { LIMITS, ThrottleError, assertNotLocked, clientIp, recordFailure } from "@/lib/auth/throttle"
import { requestPasswordReset, resetChannels } from "@/lib/auth/reset"
import { headers } from "next/headers"
import { brandForHost } from "@/lib/partners/brand"

// Which reset channels the platform offers (the forgot-password page uses this).
export async function GET() {
  return NextResponse.json(await resetChannels())
}

export async function POST(request: Request) {
  try {
    const { email } = z.object({ email: z.string().trim().email("Enter your email address.") }).parse(await request.json())
    const ip = await clientIp()
    await assertNotLocked(LIMITS.resetAccount(email), LIMITS.resetIp(ip))
    // Every request counts, so the endpoint can't be used to spam someone's inbox or WhatsApp.
    await recordFailure(LIMITS.resetAccount(email), LIMITS.resetIp(ip))
    const channels = await resetChannels()
    if (!channels.email && !channels.whatsapp)
      return NextResponse.json({ error: "Password reset isn't available yet. Please contact support to reset your password." }, { status: 503 })
    // On a partner's address, the email and link carry the partner's brand and address.
    const list = await headers()
    const host = list.get("x-forwarded-host") || list.get("host")
    const brand = await brandForHost(host)
    const origin = brand && host ? `https://${host}` : process.env.APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin
    const result = await requestPasswordReset(email, origin, brand?.name)
    return NextResponse.json({ ok: true, whatsapp: result.sent.includes("whatsapp"), phone: result.phone,
      message: "If an account exists for that email, we've sent password reset instructions." })
  } catch (error) {
    const status = error instanceof ThrottleError ? 429 : 400
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Request failed" }, { status })
  }
}
