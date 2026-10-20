import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

export async function POST() {
  try {
    const session = await getSession()
    const membership = session?.user.memberships[0]
    if (!membership) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    if (!["OWNER", "ADMIN"].includes(membership.role))
      return NextResponse.json({ error: "Only the workspace owner or an admin can disconnect Meta." }, { status: 403 })
    const organizationId = membership.organizationId

    const connections = await prisma.metaConnection.findMany({ where: { organizationId, accessTokenEncrypted: { not: null } } })
    if (!connections.length) return NextResponse.json({ ok: true, message: "Meta isn't connected to this workspace." })
    // Revoke ZKWAConnect's access on Meta's side too; continue locally even if Meta is unreachable.
    let revoked = connections.length > 0
    for (const connection of connections) {
      await metaGraph(`me/permissions`, decryptMetaToken(connection.accessTokenEncrypted!), { method: "DELETE" }).catch(() => { revoked = false })
    }
    await prisma.$transaction([
      prisma.metaConnection.updateMany({ where: { organizationId },
        data: { status: "DISCONNECTED", accessTokenEncrypted: null, tokenExpiresAt: null } }),
      prisma.onboarding.updateMany({ where: { organizationId }, data: { metaConnected: false } }),
    ])
    return NextResponse.json({ ok: true, message: revoked
      ? "Meta disconnected and ZKWAConnect's access was removed from your Facebook account."
      : "Meta disconnected from this workspace. If ZKWAConnect still appears in your Facebook Business Integrations, remove it there." })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not disconnect Meta." }, { status: 400 })
  }
}
