import { NextResponse } from "next/server"
import { z }             from "zod"
import { prisma }        from "@/lib/db/prisma"
import { verifyPassword } from "@/lib/auth/password"
import { createSession }  from "@/lib/auth/session"

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
  adminLogin: z.boolean().optional(),
})


export async function POST(req: Request) {
  try {
    const { email, password, adminLogin } = schema.parse(await req.json())

    const user = await prisma.user.findUnique({
      where:   { email: email.toLowerCase() },
      include: {
        memberships: {
          where:   { status: "ACTIVE" },
          include: { organization: { include: { onboarding: true } } },
          take: 1,
        },
      },
    })

    if (!user || !user.passwordHash)
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })

    if (!(await verifyPassword(password, user.passwordHash)))
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })

    if (user.status !== "ACTIVE")
      return NextResponse.json({ error: "Account suspended. Contact support." }, { status: 403 })

    if (adminLogin && user.adminRole === "NONE")
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })

    await createSession(user.id)
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    if (adminLogin)
      return NextResponse.json({ ok: true, redirect: "/admin/dashboard" })

    // Everyone starts on All Projects to pick (or create) the workspace to open.
    const redirect = "/projects"

    return NextResponse.json({ ok: true, redirect })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Login failed" }, { status: 400 })
  }
}
