import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { addInterval } from "@/lib/billing/activate"
import { forgetPlanCache } from "@/lib/billing/limits"
import { createWorkspace } from "@/lib/workspaces"
import { INVITE_DAYS, hashInviteToken, newInviteToken } from "@/lib/team"

// Partner programme. A partner (agency / reseller) owns client workspaces and earns from them in one of two ways,
// set per partner by the super admin:
//  • WHOLESALE  — the partner prepays a wallet and buys client plans at (list price − discount%); it bills its clients itself.
//  • COMMISSION — clients pay the platform as usual; the partner earns commission% of every plan payment (paid out by the platform).

export type PartnerModel = "WHOLESALE" | "COMMISSION"
type Tx = Prisma.TransactionClient

export async function partnerForUser(userId: string) {
  const member = await prisma.partnerMember.findFirst({ where: { userId }, include: { partner: true }, orderBy: { createdAt: "asc" } })
  return member ? { ...member.partner, role: member.role } : null
}

export async function requirePartner(userId: string, options: { active?: boolean; owner?: boolean } = { active: true }) {
  const partner = await partnerForUser(userId)
  if (!partner) throw Object.assign(new Error("You're not part of a partner account. Apply under Partner programme."), { status: 403 })
  if (options.active !== false && partner.status !== "ACTIVE") throw Object.assign(new Error(partner.status === "PENDING" ? "Your partner application is waiting for approval." : "This partner account is suspended."), { status: 403 })
  if (options.owner && partner.role !== "OWNER") throw Object.assign(new Error("Only the partner owner can do this."), { status: 403 })
  return partner
}

const RESERVED = new Set(["app", "www", "api", "admin", "mail", "partner", "partners", "static", "cdn", "help", "support", "status"])
export function validSlug(slug: string) { return /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug) && !RESERVED.has(slug) }

// Apply: the partner's own workspace becomes its account (invoices for wallet top-ups go there).
export async function applyAsPartner(userId: string, input: { organizationId: string; name: string; slug: string; note?: string }) {
  if (await partnerForUser(userId)) throw new Error("You already have a partner account.")
  const membership = await prisma.membership.findFirst({ where: { userId, organizationId: input.organizationId, role: "OWNER", status: "ACTIVE" } })
  if (!membership) throw new Error("Choose a workspace you own.")
  if (!validSlug(input.slug)) throw new Error("Use 3–30 lowercase letters, numbers or dashes for your sub-domain.")
  if (await prisma.partner.findFirst({ where: { OR: [{ slug: input.slug }, { organizationId: input.organizationId }] } })) throw new Error("That sub-domain or workspace is already used by a partner.")
  return prisma.partner.create({ data: { organizationId: input.organizationId, name: input.name, slug: input.slug, brandName: input.name, note: input.note,
    members: { create: { userId, role: "OWNER" } } } })
}

// Wallet / earnings movement, atomic with the balance. Negative amounts fail if the balance is too low (unless allowNegative).
export async function postLedger(tx: Tx, input: { partnerId: string; type: string; amount: number; description: string; reference?: string; organizationId?: string; allowNegative?: boolean }) {
  const amount = Math.round(input.amount * 100) / 100
  if (input.reference && await tx.partnerLedger.findUnique({ where: { reference: input.reference } })) return null
  const isMysql = (process.env.DATABASE_URL || "").startsWith("mysql://") || (process.env.DATABASE_URL || "").startsWith("mariadb://")
  let balanceAfter: Prisma.Decimal

  if (isMysql) {
    const current = await tx.partner.findUniqueOrThrow({ where: { id: input.partnerId }, select: { walletBalance: true } })
    if (amount < 0 && !input.allowNegative && Number(current.walletBalance) + amount < 0) {
      throw new Error("Not enough balance in the partner wallet. Top it up first.")
    }
    const updated = await tx.partner.update({
      where: { id: input.partnerId },
      data: { walletBalance: { increment: amount }, updatedAt: new Date() },
      select: { walletBalance: true }
    })
    balanceAfter = updated.walletBalance
  } else {
    const rows = amount < 0 && !input.allowNegative
      ? await tx.$queryRaw<{ walletBalance: Prisma.Decimal }[]>`UPDATE partners SET "walletBalance" = "walletBalance" + ${amount}, "updatedAt" = now() WHERE id = ${input.partnerId} AND "walletBalance" + ${amount} >= 0 RETURNING "walletBalance"`
      : await tx.$queryRaw<{ walletBalance: Prisma.Decimal }[]>`UPDATE partners SET "walletBalance" = "walletBalance" + ${amount}, "updatedAt" = now() WHERE id = ${input.partnerId} RETURNING "walletBalance"`
    if (!rows.length) throw new Error("Not enough balance in the partner wallet. Top it up first.")
    balanceAfter = rows[0].walletBalance
  }

  return tx.partnerLedger.create({ data: { partnerId: input.partnerId, organizationId: input.organizationId, type: input.type, amount, balanceAfter,
    description: input.description.slice(0, 300), reference: input.reference } })
}

// Commission on a client's paid plan invoice (called inside the payment-approval transaction; idempotent per invoice).
export async function accrueCommission(tx: Tx, organizationId: string, invoice: { id: string; amount: Prisma.Decimal | number; invoiceNumber: string; kind?: string }) {
  if (invoice.kind && invoice.kind !== "SUBSCRIPTION") return
  const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { partnerId: true, name: true } })
  if (!org?.partnerId) return
  const partner = await tx.partner.findUnique({ where: { id: org.partnerId } })
  if (!partner || partner.status !== "ACTIVE" || partner.model !== "COMMISSION") return
  const commission = Number(invoice.amount) * Number(partner.commissionPercent) / 100
  if (commission <= 0) return
  await postLedger(tx, { partnerId: partner.id, organizationId, type: "COMMISSION", amount: commission, reference: `commission:${invoice.id}`,
    description: `${partner.commissionPercent}% commission · ${org.name} · invoice ${invoice.invoiceNumber}` })
}

// New client workspace under the partner + an invitation for the client's owner.
export async function createClient(partnerId: string, userId: string, input: { name: string; ownerEmail?: string; requestUrl: string }) {
  const partner = await prisma.partner.findUniqueOrThrow({ where: { id: partnerId } })
  const org = await createWorkspace(userId, { name: input.name })
  await prisma.organization.update({ where: { id: org.id }, data: { partnerId, billingExempt: false } })
  let inviteUrl: string | null = null
  if (input.ownerEmail) {
    const token = newInviteToken()
    await prisma.invitation.create({ data: { organizationId: org.id, email: input.ownerEmail.toLowerCase(), role: "OWNER", tokenHash: hashInviteToken(token), invitedById: userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) } })
    const base = partner.customDomain && partner.domainVerifiedAt ? `https://${partner.customDomain}` : (process.env.APP_URL || new URL(input.requestUrl).origin).replace(/\/+$/, "")
    inviteUrl = `${base}/invite/${token}`
  }
  return { organization: org, inviteUrl }
}

export const wholesalePrice = (listPrice: number, discountPercent: number) => Math.round(listPrice * (100 - discountPercent)) / 100

// WHOLESALE: buy (or renew) a client's plan from the partner wallet.
export async function assignClientPlan(partnerId: string, input: { organizationId: string; planId: string; interval: "MONTHLY" | "ANNUAL" }) {
  const partner = await prisma.partner.findUniqueOrThrow({ where: { id: partnerId } })
  if (partner.model !== "WHOLESALE") throw new Error("Your clients pay for their own plans (commission programme).")
  const [org, plan] = await Promise.all([
    prisma.organization.findFirst({ where: { id: input.organizationId, partnerId } }),
    prisma.plan.findFirst({ where: { id: input.planId, status: true } }),
  ])
  if (!org) throw Object.assign(new Error("Client not found."), { status: 404 })
  if (!plan) throw new Error("Plan not found.")
  const list = Number(input.interval === "ANNUAL" ? plan.annualPrice ?? 0 : plan.monthlyPrice)
  if (list <= 0) throw new Error(`${plan.name} can't be bought ${input.interval === "ANNUAL" ? "yearly" : "monthly"}.`)
  const cost = wholesalePrice(list, Number(partner.discountPercent))
  const now = new Date()
  return prisma.$transaction(async tx => {
    const current = await tx.subscription.findFirst({ where: { organizationId: org.id, status: "ACTIVE", planId: plan.id, currentPeriodEnd: { gt: now } }, orderBy: { currentPeriodEnd: "desc" } })
    const start = current?.currentPeriodEnd || now
    const end = addInterval(start, input.interval)
    await postLedger(tx, { partnerId, organizationId: org.id, type: "PLAN", amount: -cost, description: `${plan.name} ${input.interval === "ANNUAL" ? "yearly" : "monthly"} for ${org.name} (until ${end.toLocaleDateString("en-IN")})` })
    if (current) {
      await tx.subscription.update({ where: { id: current.id }, data: { currentPeriodEnd: end } })
    } else {
      await tx.subscription.updateMany({ where: { organizationId: org.id, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE", "PENDING_PAYMENT"] } }, data: { status: "CANCELLED", cancelledAt: now } })
      await tx.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: "ACTIVE", billingInterval: input.interval, startDate: now, currentPeriodStart: now, currentPeriodEnd: end } })
    }
    await tx.organization.update({ where: { id: org.id }, data: { status: "ACTIVE" } })
    return { cost, end }
  }).finally(() => forgetPlanCache(org.id))
}

// What a partner sees about its clients.
export async function partnerClients(partnerId: string) {
  const orgs = await prisma.organization.findMany({ where: { partnerId }, orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, createdAt: true,
      subscriptions: { where: { status: { in: ["TRIAL", "ACTIVE", "PENDING_PAYMENT", "EXPIRED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, currentPeriodEnd: true, billingInterval: true, plan: { select: { name: true } } } },
      memberships: { where: { role: "OWNER", status: "ACTIVE" }, select: { user: { select: { name: true, email: true } } } },
      wabas: { select: { phoneNumbers: { where: { status: "CONNECTED" }, select: { phoneNumber: true } } } } } })
  return orgs.map(org => ({ id: org.id, name: org.name, status: org.status, createdAt: org.createdAt, subscription: org.subscriptions[0] || null,
    owners: org.memberships.map(member => member.user), numbers: org.wabas.flatMap(waba => waba.phoneNumbers.map(phone => phone.phoneNumber)) }))
}
