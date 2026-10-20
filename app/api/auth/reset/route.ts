import { NextResponse } from "next/server"
import { z } from "zod"
import { LIMITS, ThrottleError, assertNotLocked, clientIp, recordFailure } from "@/lib/auth/throttle"
import { ResetError, completePasswordReset } from "@/lib/auth/reset"

const schema = z.object({
  token: z.string().min(20).max(200).optional(),
  email: z.string().trim().email().optional(),
  code: z.string().trim().min(6).max(12).optional(),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
}).refine(input => input.token || (input.email && input.code), "Open the link from the email, or enter your email and the WhatsApp code.")

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json())
    const ip = await clientIp()
    await assertNotLocked(LIMITS.resetIp(ip))
    try {
      await completePasswordReset(input, input.password)
    } catch (error) {
      if (error instanceof ResetError) await recordFailure(LIMITS.resetIp(ip))
      throw error
    }
    return NextResponse.json({ ok: true, message: "Password changed. Sign in with your new password." })
  } catch (error) {
    const status = error instanceof ThrottleError ? 429 : 400
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Reset failed" }, { status })
  }
}
