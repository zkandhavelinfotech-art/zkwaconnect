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

  if (!connection) {
    connection = await prisma.metaConnection.findFirst({
      where: {
        OR: [
          { metaUserId: "122145064659242402", status: "CONNECTED" },
          { organization: { slug: { in: ["rta", "recruitment-training-academy"] } }, status: "CONNECTED" },
        ],
        accessTokenEncrypted: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: { accessTokenEncrypted: true },
    })
  }

  if (!connection) {
    connection = await prisma.metaConnection.findFirst({
      where: { status: "CONNECTED", accessTokenEncrypted: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { accessTokenEncrypted: true },
    })
  }

  if (!connection?.accessTokenEncrypted) return null
  return decryptMetaToken(connection.accessTokenEncrypted)
}