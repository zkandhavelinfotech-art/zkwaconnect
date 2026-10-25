import fs from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { companyEmails } from "@/lib/company"

// Local development only: company logins for the quick-fill box on /login. 404 anywhere else.
// Passwords come only from .dev-logins.json (git-ignored, on this computer) — never from the database.
function localPasswords(): Record<string, string> {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".dev-logins.json"), "utf8")) as { email: string; password: string }[]
    return Object.fromEntries(list.map(item => [item.email.toLowerCase(), item.password]))
  } catch { return {} }
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Not found" }, { status: 404 })
  const emails = await companyEmails()
  const passwords = localPasswords()
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true,
    memberships: { where: { status: "ACTIVE" }, select: { organization: { select: { name: true } } } } } })
  return NextResponse.json({ logins: emails.map(email => { const user = users.find(item => item.email.toLowerCase() === email)
    return { email, exists: Boolean(user), password: passwords[email] || null, workspaces: user?.memberships.map(member => member.organization.name) || [] } }) })
}
