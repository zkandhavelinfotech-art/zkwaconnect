import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"

export async function getOnboardingOrganizationId() {
  const session = await getSession()
  if (!session?.user || session.user.status !== "ACTIVE") return null
  // Customer workspaces are provisioned and connected by the SaaS operator.
  // Clients can inspect channel health, but cannot replace platform-owned Meta credentials/assets.
  if (session.user.adminRole === "NONE") return null
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
// This prevents Inbox/Settings from using a newer token belonging to another Meta account.
export async function getMetaAccessTokenForWaba(organizationId: string, wabaId: string) {
  const waba = await prisma.waba.findFirst({ where:{ organizationId, wabaId }, select:{ metaBusinessId:true } })
  if (!waba) return null
  const connection = await prisma.metaConnection.findFirst({
    where:{ organizationId, status:"CONNECTED", accessTokenEncrypted:{not:null},
      ...(waba.metaBusinessId ? { businessManagerId:waba.metaBusinessId } : {}) },
    orderBy:{updatedAt:"desc"}, select:{accessTokenEncrypted:true},
  })
  if (!connection?.accessTokenEncrypted) return null
  return decryptMetaToken(connection.accessTokenEncrypted)
}
