import crypto             from "node:crypto"
import { cookies, headers } from "next/headers"
import { apiPermission, PermissionError } from "@/lib/auth/permissions"
import { prisma }         from "@/lib/db/prisma"

const COOKIE  = "zkwaconnect_session"
// The project workspace the user picked on the Projects page. Everything that uses the first membership follows it.
export const WORKSPACE_COOKIE = "zkwaconnect_workspace"
const MAX_AGE = 60 * 60 * 24 * 30   // 30 days

function hashToken(token: string) {
  return crypto.createHash("sha256")
    .update(token + (process.env.SESSION_SECRET ?? "dev-secret"))
    .digest("hex")
}

export async function createSession(userId: string) {
  const token     = crypto.randomBytes(32).toString("hex")
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000)

  await prisma.session.create({ data: { userId, tokenHash, expiresAt } })

  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === "production",
    sameSite:  "lax",
    maxAge:    MAX_AGE,
    path:      "/",
  })
}

export async function getSession() {
  const jar   = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null

  const tokenHash = hashToken(token)
  const session   = await prisma.session.findUnique({
    where:   { tokenHash },
    include: {
      user: {
        select: {
          id: true, email: true, name: true,
          status: true, adminRole: true,
          memberships: {
            where:   { status: "ACTIVE" },
            orderBy: { createdAt: "asc" },
            include: {
              organization: {
                include: { onboarding: true, subscriptions: { where: { status: { not: "PENDING_PAYMENT" } }, include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 } }
              }
            }
          }
        }
      }
    }
  })

  if (!session || session.expiresAt < new Date()) return null
  const active = jar.get(WORKSPACE_COOKIE)?.value
  const list = session.user.memberships
  const index = active ? list.findIndex(membership => membership.organizationId === active) : -1
  if (index > 0) list.unshift(...list.splice(index, 1))
  const request = await headers()
  const path = request.get("x-zk-path"), method = request.get("x-zk-method")
  if (path && method && list[0]) {
    const denied = apiPermission(list[0].role, method, path)
    if (denied) throw new PermissionError(denied)
  }
  return session
}

export async function setActiveWorkspace(organizationId: string) {
  const jar = await cookies()
  jar.set(WORKSPACE_COOKIE, organizationId, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/",
  })
}

export async function deleteSession() {
  const jar   = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) {
    const tokenHash = hashToken(token)
    await prisma.session.deleteMany({ where: { tokenHash } }).catch(() => null)
  }
  jar.delete(COOKIE)
}
