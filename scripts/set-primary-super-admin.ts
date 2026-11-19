import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { prisma } from "../lib/db/prisma"

const email = (process.env.PRIMARY_ADMIN_EMAIL || "zkanddhavelinfotech@gmail.com").toLowerCase()
const temporaryPassword = `${randomBytes(18).toString("base64url")}!7a`
const legacyEmails = [
  "admin@zkwaconnect.in", "waba@zkandavelinfotech.com", "rta@recruitmentacademy.com",
  "rta@gmail.com", "smeram@smeramindustries.com", "smeram@gmail.com", "demo@zkwaconnect.in",
].filter(value => value !== email)
const obsoleteInternalEmails = ["admin@zkwaconnect.in", "waba@zkandavelinfotech.com", "demo@zkwaconnect.in"].filter(value => value !== email)

async function main() {
  const passwordHash = await bcrypt.hash(temporaryPassword, 12)
  const admin = await prisma.user.upsert({
    where: { email },
    update: { name: "ZKandhavel Infotech Super Admin", passwordHash, passwordChangedAt: new Date(), status: "ACTIVE", adminRole: "SUPER_ADMIN" },
    create: { email, name: "ZKandhavel Infotech Super Admin", passwordHash, passwordChangedAt: new Date(), status: "ACTIVE", adminRole: "SUPER_ADMIN" },
  })
  const company = await prisma.organization.findFirst({ where: { slug: "zkandavel-infotech" }, select: { id:true } })
  if (company) await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: company.id, userId: admin.id } },
    create: { organizationId: company.id, userId: admin.id, role: "OWNER", status: "ACTIVE" },
    update: { role: "OWNER", status: "ACTIVE" },
  })
  const legacy = await prisma.user.findMany({ where: { email: { in: legacyEmails } }, select: { id:true } })
  if (legacy.length) {
    await prisma.session.deleteMany({ where: { userId: { in: legacy.map(user => user.id) } } })
    await prisma.user.updateMany({ where: { id: { in: legacy.map(user => user.id) } }, data: { adminRole: "NONE" } })
  }
  await prisma.user.updateMany({ where: { email: { in: obsoleteInternalEmails } }, data: { status: "INACTIVE", adminRole: "NONE" } })
  await prisma.session.deleteMany({ where: { userId: admin.id } })
  await prisma.auditLog.create({ data: {
    userId: admin.id, organizationId: company?.id || null, actorType: "SYSTEM", action: "PRIMARY_SUPER_ADMIN_SET",
    resource: "User", resourceId: admin.id, metadata: { email, legacyAdminsDemoted: legacy.length, obsoleteInternalLoginsDisabled: obsoleteInternalEmails.length },
  } })
  console.log(JSON.stringify({ loginUrl: "/admin/login", email, temporaryPassword, legacyAdminsDemoted: legacy.length, obsoleteInternalLoginsDisabled: obsoleteInternalEmails.length }, null, 2))
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
