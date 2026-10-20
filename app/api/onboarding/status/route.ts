import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { graphVersion, metaGraph } from "@/lib/meta/graph"
import { metaLoginConfig } from "@/lib/meta/config"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSession()
  const membership = session?.user.status === "ACTIVE" ? session.user.memberships[0] : undefined
  if (!session || !membership) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
  const organizationId = membership.organizationId

  const [onboarding, connection, waba] = await Promise.all([
    prisma.onboarding.findUnique({ where: { organizationId } }),
    prisma.metaConnection.findFirst({ where: { organizationId, status: "CONNECTED", accessTokenEncrypted: { not: null } },
      orderBy: { updatedAt: "desc" } }),
    prisma.waba.findFirst({ where: { organizationId, status: "CONNECTED" }, include: { phoneNumbers: true } }),
  ])

  // "Connected" means Meta still accepts the stored token right now, not just that we once saved one.
  let meta: { name: string | null; metaUserId: string | null; connectedAt: Date | null; tokenExpiresAt: Date | null } | null = null
  let metaError: string | null = null
  if (connection?.accessTokenEncrypted) {
    try {
      const profile = await metaGraph<{ id: string; name?: string }>("me?fields=id,name", decryptMetaToken(connection.accessTokenEncrypted))
      meta = { name: profile.name || null, metaUserId: profile.id, connectedAt: connection.connectedAt, tokenExpiresAt: connection.tokenExpiresAt }
    } catch (error) {
      metaError = `Your Meta connection no longer works (${error instanceof Error ? error.message : "token rejected"}). Reconnect to continue.`
    }
  }
  const phone = waba?.phoneNumbers.find(item => item.status === "CONNECTED")
  const metaLogin = metaLoginConfig()
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID || ""

  return NextResponse.json({
    account: { name: session.user.name, email: session.user.email, workspace: membership.organization.name, role: membership.role,
      isPlatformAdmin: session.user.adminRole !== "NONE" },
    metaLogin,
    // Served at request time so admin changes to .env apply without rebuilding the browser bundle.
    embeddedSignup: metaLogin.ready && /^\d{5,25}$/.test(configId)
      ? { appId: process.env.META_APP_ID!, configId, graphVersion: graphVersion() } : null,
    metaConnected: Boolean(meta),
    meta,
    metaError,
    // Derived from the live records, not the saved flags, so switching accounts can't leave them stale.
    wabaCreated: Boolean(waba),
    phoneRegistered: Boolean(phone),
    phoneVerified: Boolean(phone),
    completedAt: onboarding?.completedAt?.toISOString() ?? null,
    waba: waba ? { name: waba.name, wabaId: waba.wabaId } : null,
    phone: phone ? { phoneNumber: phone.phoneNumber } : null,
  })
}
