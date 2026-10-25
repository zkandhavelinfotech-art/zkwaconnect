import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { companyEmails } from "@/lib/company"

// Local development only: company login emails (no passwords) for the quick-fill box on /login. 404 anywhere else.
export async function GET() {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Not found" }, { status: 404 })
  const emails = await companyEmails()
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true, name: true,
    memberships: { where: { status: "ACTIVE" }, select: { organization: { select: { name: true } } } } } })
  return NextResponse.json({ logins: emails.map(email => { const user = users.find(item => item.email.toLowerCase() === email)
    return { email, exists: Boolean(user), workspaces: user?.memberships.map(member => member.organization.name) || [] } }) })
}
