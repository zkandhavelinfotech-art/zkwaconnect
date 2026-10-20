import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { createSession, getSession, setActiveWorkspace } from "@/lib/auth/session"
import { hashPassword } from "@/lib/auth/password"
import { ROLE_INFO } from "@/lib/auth/permissions"
import { hashInviteToken } from "@/lib/team"

async function findInvite(token: string) {
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: hashInviteToken(token) }, include: { organization: { select: { id: true, name: true } } } })
  const problem = !invite ? "This invite link isn't valid." : invite.revokedAt ? "This invite was cancelled. Ask for a new one."
    : invite.acceptedAt ? "This invite has already been used." : invite.expiresAt < new Date() ? "This invite has expired. Ask for a new one." : null
  return { invite, problem }
}

// What the invite page needs: workspace, role, and whether the visitor is signed in as the invited email.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { invite, problem } = await findInvite((await params).token)
  if (!invite || problem) return NextResponse.json({ error: problem }, { status: 404 })
  const session = await getSession().catch(() => null)
  const account = await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } })
  return NextResponse.json({ workspace: invite.organization.name, email: invite.email, role: invite.role, roleLabel: ROLE_INFO[invite.role].label,
    roleSummary: ROLE_INFO[invite.role].summary, signedInAs: session?.user.email || null, accountExists: Boolean(account) })
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("register"), name: z.string().trim().min(2, "Enter your name.").max(80), password: z.string().min(8, "Use at least 8 characters.").max(200) }),
])

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { invite, problem } = await findInvite((await params).token)
    if (!invite || problem) return NextResponse.json({ error: problem }, { status: 404 })
    const input = schema.parse(await request.json())
    let userId: string
    if (input.action === "accept") {
      const session = await getSession()
      if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
      if (session.user.email.toLowerCase() !== invite.email) return NextResponse.json({ error: `This invite is for ${invite.email}. Sign out and sign in with that email.` }, { status: 403 })
      userId = session.user.id
    } else {
      if (await prisma.user.findUnique({ where: { email: invite.email } })) return NextResponse.json({ error: "An account with this email already exists — sign in to accept." }, { status: 409 })
      const user = await prisma.user.create({ data: { email: invite.email, name: input.name, passwordHash: await hashPassword(input.password), status: "ACTIVE" } })
      userId = user.id
    }
    // Claim the invite once (two tabs can't both use it), then add or update the membership.
    const claimed = await prisma.invitation.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } })
    if (!claimed.count) return NextResponse.json({ error: "This invite has already been used." }, { status: 409 })
    await prisma.membership.upsert({ where: { organizationId_userId: { organizationId: invite.organizationId, userId } },
      create: { userId, organizationId: invite.organizationId, role: invite.role, status: "ACTIVE" }, update: { role: invite.role, status: "ACTIVE" } })
    if (input.action === "register") await createSession(userId)
    await setActiveWorkspace(invite.organizationId)
    return NextResponse.json({ ok: true, redirect: "/app/dashboard", message: `Welcome to ${invite.organization.name}!` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" }, { status: 400 })
  }
}
