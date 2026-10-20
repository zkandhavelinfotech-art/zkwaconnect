import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession, setActiveWorkspace } from "@/lib/auth/session"

// Switches the active project workspace (only to one the user belongs to).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(await request.json())
    const membership = session.user.memberships.find(item => item.organizationId === organizationId)
    if (!membership) return NextResponse.json({ error: "You don't have access to that project." }, { status: 403 })
    await setActiveWorkspace(organizationId)
    const done = Boolean(membership.organization.onboarding?.completedAt)
    return NextResponse.json({ ok: true, redirect: done ? "/app/dashboard" : "/onboarding" })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not open the project." }, { status: 400 })
  }
}
