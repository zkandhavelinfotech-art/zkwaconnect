import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { hashPassword, verifyPassword } from "@/lib/auth/password"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id },
    select: { name: true, email: true, phone: true, createdAt: true, lastLoginAt: true } })
  return NextResponse.json({ user, workspaces: session.user.memberships.map(item => ({ id: item.organizationId, name: item.organization.name, role: item.role })) })
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name needs at least 2 characters.").max(80),
  phone: z.string().trim().regex(/^\+?[\d\s-]{8,18}$/, "Enter a valid phone number.").optional().or(z.literal("")),
})
const passwordSchema = z.object({ currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "New password must be at least 8 characters.").max(128) })

export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const input = profileSchema.parse(await request.json())
    await prisma.user.update({ where: { id: session.user.id }, data: { name: input.name, phone: input.phone || null } })
    return NextResponse.json({ ok: true, message: "Profile saved." })
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Could not save your profile." }, { status: 400 })
  }
}

// Change password: requires the current one; signs out the user's other sessions.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const input = passwordSchema.parse(await request.json())
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { passwordHash: true } })
    if (!user.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash)))
      return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 })
    await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash: await hashPassword(input.newPassword) } })
    await prisma.session.deleteMany({ where: { userId: session.user.id, id: { not: session.id } } })
    return NextResponse.json({ ok: true, message: "Password changed. Other devices have been signed out." })
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Could not change your password." }, { status: 400 })
  }
}
