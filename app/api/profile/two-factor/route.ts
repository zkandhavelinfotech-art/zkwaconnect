import { NextResponse } from "next/server"
import QRCode from "qrcode"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { verifyPassword } from "@/lib/auth/password"
import { LIMITS, ThrottleError, assertNotLocked, recordFailure } from "@/lib/auth/throttle"
import { newRecoveryCodes, newTotpSecret, openSecret, otpauthUrl, sealSecret, verifySecondFactor, verifyTotp } from "@/lib/auth/totp"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: error instanceof ThrottleError ? 429 : (error as { status?: number }).status || 400 })

async function currentUser() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error("Sign in to continue."), { status: 401 })
  return prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })
}

export async function GET() {
  try {
    const user = await currentUser()
    return NextResponse.json({ enabled: Boolean(user.twoFactorEnabledAt), enabledAt: user.twoFactorEnabledAt,
      recoveryLeft: Array.isArray(user.twoFactorRecovery) ? user.twoFactorRecovery.length : 0 })
  } catch (error) { return fail(error) }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("enable"), code: z.string().trim().min(6).max(8) }),
  z.object({ action: z.literal("disable"), password: z.string().min(1), code: z.string().trim().min(6).max(12) }),
  z.object({ action: z.literal("recovery"), code: z.string().trim().min(6).max(8) }),
])

// setup → secret + QR; enable (with a code from the app) → recovery codes; disable needs password + code; recovery issues new codes.
export async function POST(request: Request) {
  try {
    const user = await currentUser()
    const input = schema.parse(await request.json())
    await assertNotLocked(LIMITS.twoFactor(user.id))
    const wrong = async (message: string) => { await recordFailure(LIMITS.twoFactor(user.id)); throw new Error(message) }

    if (input.action === "setup") {
      if (user.twoFactorEnabledAt) throw new Error("Two-factor sign-in is already on.")
      const secret = newTotpSecret()
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: sealSecret(secret) } })
      const url = otpauthUrl(user.email, secret)
      return NextResponse.json({ secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }), url })
    }
    if (input.action === "enable") {
      if (user.twoFactorEnabledAt) throw new Error("Two-factor sign-in is already on.")
      if (!user.twoFactorSecret) throw new Error("Start the setup first.")
      if (!verifyTotp(openSecret(user.twoFactorSecret), input.code)) await wrong("That code is not right. Check the time on your phone and try the newest code.")
      const { codes, hashes } = newRecoveryCodes()
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabledAt: new Date(), twoFactorRecovery: hashes } })
      return NextResponse.json({ ok: true, recoveryCodes: codes, message: "Two-factor sign-in is on." })
    }
    if (input.action === "recovery") {
      if (!user.twoFactorEnabledAt || !user.twoFactorSecret) throw new Error("Two-factor sign-in is off.")
      if (!verifyTotp(openSecret(user.twoFactorSecret), input.code)) await wrong("That code is not right.")
      const { codes, hashes } = newRecoveryCodes()
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorRecovery: hashes } })
      return NextResponse.json({ ok: true, recoveryCodes: codes, message: "New recovery codes created; the old ones no longer work." })
    }
    if (!user.twoFactorEnabledAt) throw new Error("Two-factor sign-in is already off.")
    if (!user.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) await wrong("Your password is not right.")
    if (!(await verifySecondFactor(user, input.code))) await wrong("That code is not right.")
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabledAt: null, twoFactorSecret: null, twoFactorRecovery: [] } })
    return NextResponse.json({ ok: true, message: "Two-factor sign-in is off." })
  } catch (error) { return fail(error) }
}
