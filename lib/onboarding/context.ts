import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"

export async function getOnboardingOrganizationId() {
  const session = await getSession()
  if (!session?.user || session.user.status !== "ACTIVE") return null
  return session.user.memberships[0]?.organizationId ?? null
}

export async function getMetaAccessToken(organizationId: string) {
  let connection = await prisma.metaConnection.findFirst({
    where: { organizationId, status: "CONNECTED", accessTokenEncrypted: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { accessTokenEncrypted: true },
  })

  if (!connection?.accessTokenEncrypted) return null
  return decryptMetaToken(connection.accessTokenEncrypted)
}

// Selects the token connected to the exact Business Portfolio that owns a WABA.
// Falls back to the latest active organization token if portfolio ID is unassigned or migrated.
export async function getMetaAccessTokenForWaba(organizationId: string, wabaId: string) {
  const waba = await prisma.waba.findFirst({ where: { organizationId, wabaId }, select: { metaBusinessId: true } })
  if (!waba) return null

  let connection = null
  if (waba.metaBusinessId) {
    connection = await prisma.metaConnection.findFirst({
      where: {
        organizationId,
        status: "CONNECTED",
        accessTokenEncrypted: { not: null },
        businessManagerId: waba.metaBusinessId,
      },
      orderBy: { updatedAt: "desc" },
      select: { accessTokenEncrypted: true },
    })
  }

  if (!connection?.accessTokenEncrypted) {
    connection = await prisma.metaConnection.findFirst({
      where: {
        organizationId,
        status: "CONNECTED",
        accessTokenEncrypted: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: { accessTokenEncrypted: true },
    })
  }

  if (!connection?.accessTokenEncrypted) return null
  return decryptMetaToken(connection.accessTokenEncrypted)
}
