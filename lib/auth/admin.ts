import { getSession } from "@/lib/auth/session"

export async function getAdminSession() {
  const session = await getSession()
  if (!session?.user || session.user.status !== "ACTIVE" || session.user.adminRole === "NONE") {
    return null
  }
  return session.user
}

export async function assertAdminSession() {
  const session = await getSession()
  if (!session?.user || session.user.status !== "ACTIVE" || session.user.adminRole === "NONE") {
    throw Object.assign(new Error("Admin access required."), { status: 403 })
  }
  return session.user
}
