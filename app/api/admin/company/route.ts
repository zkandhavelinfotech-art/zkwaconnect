import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { companyEmails, saveCompanyEmails } from "@/lib/company"

async function superAdmin() {
  const session = await getSession()
  if (session?.user.adminRole !== "SUPER_ADMIN") throw Object.assign(new Error("Super admin access required."), { status: 403 })
}
const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: (error as { status?: number }).status || 400 })

// Company logins: projects they create are internal (no plan, no limits, no charges).
export async function GET() {
  try {
    await superAdmin()
    const emails = await companyEmails()
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true, name: true, lastLoginAt: true } })
    const internal = await prisma.organization.findMany({ where: { billingExempt: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    return NextResponse.json({ emails: emails.map(email => ({ email, account: users.find(user => user.email.toLowerCase() === email) || null })), internal })
  } catch (error) { return fail(error) }
}

export async function PUT(request: Request) {
  try {
    await superAdmin()
    const { emails } = z.object({ emails: z.array(z.string().trim().toLowerCase().email("Enter valid email addresses.")).max(50) }).parse(await request.json())
    await saveCompanyEmails(emails)
    return NextResponse.json({ ok: true, message: "Company logins saved. New projects they create are internal." })
  } catch (error) { return fail(error) }
}
