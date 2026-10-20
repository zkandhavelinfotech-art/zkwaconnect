import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

// Validates the session on the server (the middleware only checks that a cookie exists).
export default async function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.user.status !== "ACTIVE")
    redirect(`/api/auth/logout?next=${encodeURIComponent("/login?from=/projects")}`)
  return children
}
