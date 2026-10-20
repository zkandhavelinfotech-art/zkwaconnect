import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

// The middleware only checks that a session cookie exists; this validates it against the database.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.user.status !== "ACTIVE")
    redirect(`/api/auth/logout?next=${encodeURIComponent("/login?from=/onboarding")}`)
  if (!session.user.memberships.length)
    redirect(session.user.adminRole !== "NONE" ? "/admin/dashboard" : "/api/auth/logout?next=/register")
  return children
}
