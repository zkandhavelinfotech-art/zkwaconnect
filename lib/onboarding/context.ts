import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"

export async function getOnboardingOrganizationId() {
  const session = await getSession()
  if (!session?.user || session.user.status !== "ACTIVE") return null
  return session.user.memberships[0]?.organizationId ?? null
}

export async function getMetaAccessToken(organizationId: string) {
  const connection = await prisma.metaConnection.findFirst({
    where: { organizationId, status: "CONNECTED", accessTokenEncrypted: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { accessTokenEncrypted: true },
  })
  if (!connection?.accessTokenEncrypted) return null
  return decryptMetaToken(connection.accessTokenEncrypted)
}