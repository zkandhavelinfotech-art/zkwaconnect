import { getSession } from "@/lib/auth/session"

export const MANAGER_ROLES = ["OWNER", "ADMIN", "MANAGER"]

// The signed-in user's active workspace membership, or a 401 error to throw.
export async function requireMember(options: { manager?: boolean } = {}) {
  const session = await getSession()
  const membership = session?.user.memberships.find(item => item.status === "ACTIVE")
  if (!session || !membership) throw Object.assign(new Error("Sign in to continue."), { status: 401 })
  if (options.manager && !MANAGER_ROLES.includes(membership.role))
    throw Object.assign(new Error("Only workspace owners, admins and managers can change this."), { status: 403 })
  return { organizationId: membership.organizationId, userId: session.user.id, role: membership.role }
}

export function errorStatus(error: unknown) {
  return (error as { status?: number }).status || 400
}
