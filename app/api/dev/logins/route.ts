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
  const isDevOrDemo = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_LOGIN === "on"
  if (!isDevOrDemo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const emails = await companyEmails()
    const passwords = localPasswords()
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: {
        email: true,
        memberships: { where: { status: "ACTIVE" }, select: { organization: { select: { name: true } } } },
      },
    })
    return NextResponse.json({
      logins: emails.map(email => {
        const user = users.find(item => item.email.toLowerCase() === email)
        const defaultPass = email.includes("waba") ? "waba1234" : email.includes("admin") ? "admin2026!" : "demo1234"
        return {
          email,
          exists: Boolean(user),
          password: passwords[email] || defaultPass,
          workspaces: user?.memberships.map(member => member.organization.name) || ["ZKandhavel Infotech"],
        }
      }),
    })
  } catch {
    return NextResponse.json({
      logins: [
        { email: "waba@zkandavelinfotech.com", exists: true, password: "waba1234", workspaces: ["ZKandhavel Infotech"] },
        { email: "demo@zkwaconnect.in", exists: true, password: "demo1234", workspaces: ["Demo Business"] },
        { email: "admin@zkwaconnect.in", exists: true, password: "admin2026!", workspaces: ["Platform Admin"] },
      ],
    })
  }
}
