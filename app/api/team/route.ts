import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { ROLE_INFO, ROLES, type Role } from "@/lib/auth/permissions"
import { assertSeatAvailable, planState } from "@/lib/billing/limits"
import { hashInviteToken, INVITE_DAYS, inviteBase, newInviteToken } from "@/lib/team"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: errorStatus(error) })

// Only owners can hand out (or take away) Owner/Admin; admins manage everyone below them.
function canManage(actor: string, targetRole: string) {
  return actor === "OWNER" || (actor === "ADMIN" && !["OWNER", "ADMIN"].includes(targetRole))
}

export async function GET() {
  try {
    const { organizationId, userId, role } = await requireMember()
    const [members, invites, plan] = await Promise.all([
      prisma.membership.findMany({ where: { organizationId, status: { in: ["ACTIVE", "SUSPENDED"] } }, orderBy: { createdAt: "asc" },
        select: { role: true, status: true, createdAt: true, user: { select: { id: true, name: true, email: true, lastLoginAt: true } } } }),
      prisma.invitation.findMany({ where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, createdAt: true, expiresAt: true } }),
      planState(organizationId),
    ])
    const open = await prisma.conversation.groupBy({ by: ["assignedUserId"], where: { organizationId, status: { in: ["OPEN", "PENDING"] }, assignedUserId: { not: null } }, _count: { _all: true } })
    return NextResponse.json({
      me: { userId, role }, roles: ROLES.map(item => ({ role: item, ...ROLE_INFO[item] })),
      seats: { used: plan.usage.users + plan.usage.invites, limit: plan.limits.users, plan: plan.planName },
      members: members.map(member => ({ ...member.user, role: member.role, status: member.status, joinedAt: member.createdAt,
        openChats: open.find(row => row.assignedUserId === member.user.id)?._count._all || 0, canManage: member.user.id !== userId && canManage(role, member.role) })),
      invites,
    })
  } catch (error) { return fail(error) }
}

// Invite by email: returns a one-time link (valid 7 days) to share by email or WhatsApp.
export async function POST(request: Request) {
  try {
    const { organizationId, userId, role } = await requireMember()
    const input = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address."), role: z.enum(ROLES) }).parse(await request.json())
    if (!canManage(role, input.role)) return NextResponse.json({ error: `Only an owner can invite someone as ${ROLE_INFO[input.role].label}.` }, { status: 403 })
    const existing = await prisma.membership.findFirst({ where: { organizationId, status: { in: ["ACTIVE", "SUSPENDED"] }, user: { email: input.email } } })
    if (existing) return NextResponse.json({ error: "That person is already in this workspace." }, { status: 409 })
    // A new invite for the same email replaces the old one (and doesn't take an extra seat).
    await prisma.invitation.updateMany({ where: { organizationId, email: input.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
    await assertSeatAvailable(organizationId)
    const token = newInviteToken()
    await prisma.invitation.create({ data: { organizationId, email: input.email, role: input.role, tokenHash: hashInviteToken(token), invitedById: userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) } })
    const link = `${inviteBase(request.url)}/invite/${token}`
    return NextResponse.json({ ok: true, link, message: `Invite created for ${input.email}. Share this link with them — it works once and expires in ${INVITE_DAYS} days.` }, { status: 201 })
  } catch (error) { return fail(error) }
}

// Change someone's role, or suspend / restore their access.
export async function PATCH(request: Request) {
  try {
    const { organizationId, userId, role } = await requireMember()
    const input = z.object({ userId: z.string().min(1), role: z.enum(ROLES).optional(), status: z.enum(["ACTIVE", "SUSPENDED"]).optional() }).parse(await request.json())
    if (input.userId === userId) return NextResponse.json({ error: "You can't change your own role or access." }, { status: 400 })
    const target = await prisma.membership.findFirst({ where: { organizationId, userId: input.userId } })
    if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 })
    if (!canManage(role, target.role) || (input.role && !canManage(role, input.role)))
      return NextResponse.json({ error: "Only an owner can change owners and admins." }, { status: 403 })
    if (target.role === "OWNER" && (input.role && input.role !== "OWNER" || input.status === "SUSPENDED")) {
      const owners = await prisma.membership.count({ where: { organizationId, role: "OWNER", status: "ACTIVE" } })
      if (owners <= 1) return NextResponse.json({ error: "A workspace needs at least one active owner." }, { status: 400 })
    }
    if (input.status === "ACTIVE" && target.status !== "ACTIVE") await assertSeatAvailable(organizationId)
    await prisma.membership.update({ where: { id: target.id }, data: { ...(input.role ? { role: input.role } : {}), ...(input.status ? { status: input.status } : {}) } })
    if (input.status === "SUSPENDED") await prisma.conversation.updateMany({ where: { organizationId, assignedUserId: input.userId, status: { in: ["OPEN", "PENDING"] } }, data: { assignedUserId: null } })
    return NextResponse.json({ ok: true, message: input.status === "SUSPENDED" ? "Access suspended. Their open chats were unassigned." : input.status === "ACTIVE" ? "Access restored." : `Role changed to ${ROLE_INFO[input.role as Role].label}.` })
  } catch (error) { return fail(error) }
}

// Remove a member (?userId=) or revoke a pending invite (?invite=).
export async function DELETE(request: Request) {
  try {
    const { organizationId, userId, role } = await requireMember()
    const url = new URL(request.url)
    const inviteId = url.searchParams.get("invite")
    if (inviteId) {
      const invite = await prisma.invitation.findFirst({ where: { id: inviteId, organizationId } })
      if (!invite || !canManage(role, invite.role)) return NextResponse.json({ error: "Invite not found." }, { status: 404 })
      await prisma.invitation.update({ where: { id: invite.id }, data: { revokedAt: new Date() } })
      return NextResponse.json({ ok: true, message: "Invite revoked — the link no longer works." })
    }
    const memberId = url.searchParams.get("userId") || ""
    if (memberId === userId) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 })
    const target = await prisma.membership.findFirst({ where: { organizationId, userId: memberId } })
    if (!target || !canManage(role, target.role)) return NextResponse.json({ error: target ? "Only an owner can remove owners and admins." : "Member not found." }, { status: target ? 403 : 404 })
    if (target.role === "OWNER" && await prisma.membership.count({ where: { organizationId, role: "OWNER", status: "ACTIVE" } }) <= 1)
      return NextResponse.json({ error: "A workspace needs at least one active owner." }, { status: 400 })
    await prisma.$transaction([
      prisma.conversation.updateMany({ where: { organizationId, assignedUserId: memberId, status: { in: ["OPEN", "PENDING"] } }, data: { assignedUserId: null } }),
      prisma.membership.delete({ where: { id: target.id } }),
    ])
    return NextResponse.json({ ok: true, message: "Removed from the workspace. Their open chats were unassigned." })
  } catch (error) { return fail(error) }
}

export const dynamic = "force-dynamic"
