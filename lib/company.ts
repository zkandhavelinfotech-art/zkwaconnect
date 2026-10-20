import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"

// The platform owner's company logins (ZKandavel Infotech). Every project they create is an internal
// workspace: all features, no limits, no plan or message charges. Editable by super admins.
const KEY = "company_accounts"

export async function companyEmails(): Promise<string[]> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } })
  const value = row?.value as { emails?: unknown } | undefined
  return Array.isArray(value?.emails) ? value.emails.filter((email): email is string => typeof email === "string").map(email => email.toLowerCase()) : []
}

export async function saveCompanyEmails(emails: string[]) {
  const value = { emails: [...new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean))] } as Prisma.InputJsonValue
  await prisma.platformSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
}

export async function isCompanyEmail(email: string | null | undefined) {
  return Boolean(email) && (await companyEmails()).includes(email!.toLowerCase())
}
