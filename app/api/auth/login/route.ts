import { NextResponse } from "next/server"
import { z }             from "zod"
import { prisma }        from "@/lib/db/prisma"
import { verifyPassword } from "@/lib/auth/password"
import { createSession, setActiveWorkspace }  from "@/lib/auth/session"
import { LIMITS, ThrottleError, assertNotLocked, clearThrottle, clientIp, recordFailure } from "@/lib/auth/throttle"
import { verifySecondFactor } from "@/lib/auth/totp"

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(1).max(200),
  totpCode: z.string().trim().max(20).optional(),
  adminLogin: z.boolean().optional(),
})

// Sign-in: 5 wrong passwords (or 2FA codes) for an account within 15 minutes lock it for 15 minutes; 30 failures from one IP lock that IP.
export async function POST(req: Request) {
  try {
    const { email, password, totpCode, adminLogin } = schema.parse(await req.json())
    const ip = await clientIp()
    const account = LIMITS.loginAccount(email), fromIp = LIMITS.loginIp(ip)
    await assertNotLocked(account, fromIp)

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })

    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      await recordFailure(account, fromIp)
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    if (user.status !== "ACTIVE")
      return NextResponse.json({ error: "Account suspended. Contact support." }, { status: 403 })

    if (adminLogin && user.adminRole === "NONE")
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })

    // Two-factor: the password was right; now the authenticator (or a recovery) code is needed.
    if (user.twoFactorEnabledAt) {
      if (!totpCode) return NextResponse.json({ error: "Enter the 6-digit code from your authenticator app", require2FA: true }, { status: 403 })
      if (!(await verifySecondFactor(user, totpCode))) {
        await recordFailure(account, fromIp)
        return NextResponse.json({ error: "That code is not right. Check your authenticator app, or use a recovery code.", require2FA: true }, { status: 403 })
      }
    }

    await clearThrottle(account)
    await createSession(user.id)
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    if (adminLogin)
      return NextResponse.json({ ok: true, redirect: "/admin/dashboard" })

    // A normal client usually owns one managed workspace and should enter it directly.
    // Multi-workspace users and platform admins still choose the tenant explicitly.
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
      take: 2,
    })
    if (user.adminRole === "NONE" && memberships.length === 1) {
      await setActiveWorkspace(memberships[0].organizationId)
      return NextResponse.json({ ok: true, redirect: "/app/dashboard" })
    }
    return NextResponse.json({ ok: true, redirect: "/projects" })
  } catch (e) {
    if (e instanceof ThrottleError) return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } })
    return NextResponse.json({ error: e instanceof z.ZodError ? "Enter your email and password." : e instanceof Error ? e.message : "Login failed" }, { status: 400 })
  }
}
