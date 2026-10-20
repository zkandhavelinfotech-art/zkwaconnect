import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession, setActiveWorkspace } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { createWorkspace } from "@/lib/workspaces"

// The user's project workspaces for the All Projects page.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
  const ids = session.user.memberships.map(membership => membership.organizationId)
  const [phones, contacts] = await Promise.all([
    prisma.phoneNumber.findMany({ where: { status: "CONNECTED", waba: { status: "CONNECTED", organizationId: { in: ids } } },
      select: { phoneNumber: true, waba: { select: { organizationId: true } } } }),
    prisma.contact.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids } }, _count: { _all: true } }),
  ])
  return NextResponse.json({
    user: { name: session.user.name, email: session.user.email, isPlatformAdmin: session.user.adminRole !== "NONE" },
    activeId: session.user.memberships[0]?.organizationId || null,
    workspaces: session.user.memberships.map(membership => {
      const org = membership.organization
      const subscription = org.subscriptions[0]
      return {
        id: org.id, name: org.name, role: membership.role, status: org.status, createdAt: org.createdAt,
        plan: subscription ? { name: subscription.plan.name, status: subscription.status, renewsOn: subscription.currentPeriodEnd } : null,
        whatsapp: phones.find(phone => phone.waba.organizationId === org.id)?.phoneNumber || null,
        setupComplete: Boolean(org.onboarding?.completedAt),
        contacts: contacts.find(row => row.organizationId === org.id)?._count._all || 0,
      }
    }),
  })
}

const createSchema = z.object({ name: z.string().trim().min(2, "Project name needs at least 2 characters.").max(100), gstin: z.string().trim().max(15).optional() })

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const input = createSchema.parse(await request.json())
    const workspace = await createWorkspace(session.user.id, { name: input.name, gstin: input.gstin || undefined })
    await setActiveWorkspace(workspace.id)
    return NextResponse.json({ ok: true, id: workspace.id, redirect: "/onboarding" }, { status: 201 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Could not create the project."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
