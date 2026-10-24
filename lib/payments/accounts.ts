import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta/token"

// Where a workspace's customers pay: the workspace's own UPI ID / Razorpay / Cashfree account.
// Customer money must never land in the platform's account, so the platform's .env keys are used only
// for internal workspaces (the platform owner's own company), and only when they haven't added their own.

export type Provider = "UPI" | "RAZORPAY" | "CASHFREE" | "WHATSAPP_PAY"
export type UpiAccount = { id: string | null; upiId: string; payeeName: string }
export type RazorpayAccount = { id: string | null; keyId: string; keySecret: string; webhookSecret: string }
export type CashfreeAccount = { id: string | null; clientId: string; clientSecret: string; webhookSecret: string; production: boolean }
export type WhatsAppPayConfig = { id: string; configurationName: string; gateway: string }
export type Accounts = { UPI?: UpiAccount; RAZORPAY?: RazorpayAccount; CASHFREE?: CashfreeAccount; WHATSAPP_PAY?: WhatsAppPayConfig }

const UPI_ID = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/
export const isUpiId = (value: string) => UPI_ID.test(value.trim())

export async function paymentAccounts(organizationId: string): Promise<Accounts> {
  const [rows, org] = await Promise.all([
    prisma.paymentAccount.findMany({ where: { organizationId, status: "ACTIVE" } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { billingExempt: true, name: true, legalName: true } }),
  ])
  const out: Accounts = {}
  for (const row of rows) {
    const config = row.config as Record<string, string | boolean>
    const secret = row.secretEncrypted ? JSON.parse(decryptMetaToken(row.secretEncrypted)) as Record<string, string> : {}
    if (row.provider === "UPI") out.UPI = { id: row.id, upiId: String(config.upiId), payeeName: String(config.payeeName || org?.legalName || org?.name || "") }
    if (row.provider === "RAZORPAY") out.RAZORPAY = { id: row.id, keyId: String(config.keyId), keySecret: secret.keySecret || "", webhookSecret: secret.webhookSecret || "" }
    if (row.provider === "WHATSAPP_PAY") out.WHATSAPP_PAY = { id: row.id, configurationName: String(config.configurationName), gateway: String(config.gateway) }
    if (row.provider === "CASHFREE") out.CASHFREE = { id: row.id, clientId: String(config.clientId), clientSecret: secret.clientSecret || "", webhookSecret: secret.webhookSecret || "", production: config.production !== false }
  }
  if (org?.billingExempt) {
    const env = process.env
    if (!out.UPI && env.UPI_ID) out.UPI = { id: null, upiId: env.UPI_ID, payeeName: env.COMPANY_NAME || org.name }
    if (!out.RAZORPAY && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) out.RAZORPAY = { id: null, keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || "" }
    if (!out.CASHFREE && env.CASHFREE_CLIENT_ID && env.CASHFREE_CLIENT_SECRET)
      out.CASHFREE = { id: null, clientId: env.CASHFREE_CLIENT_ID, clientSecret: env.CASHFREE_CLIENT_SECRET, webhookSecret: env.CASHFREE_WEBHOOK_SECRET || "", production: env.CASHFREE_ENV === "production" }
  }
  return out
}

// What the settings screen shows: no secrets, just whether they're set.
export async function accountSummary(organizationId: string) {
  const rows = await prisma.paymentAccount.findMany({ where: { organizationId } })
  return rows.map(row => {
    const config = row.config as Record<string, unknown>
    return { provider: row.provider, status: row.status, configurationName: config.configurationName ?? null, gateway: config.gateway ?? null, upiId: config.upiId ?? null, payeeName: config.payeeName ?? null, keyId: config.keyId ?? config.clientId ?? null,
      production: config.production ?? null, hasSecret: Boolean(row.secretEncrypted), updatedAt: row.updatedAt }
  })
}

export async function savePaymentAccount(organizationId: string, provider: Provider, config: Record<string, string | boolean>, secrets?: Record<string, string>) {
  const existing = await prisma.paymentAccount.findUnique({ where: { organizationId_provider: { organizationId, provider } } })
  // Blank secret fields keep the stored value, so the form never has to show secrets.
  const previous = existing?.secretEncrypted ? JSON.parse(decryptMetaToken(existing.secretEncrypted)) as Record<string, string> : {}
  const merged = secrets ? Object.fromEntries(Object.entries({ ...previous, ...Object.fromEntries(Object.entries(secrets).filter(([, value]) => value)) })) : previous
  const secretEncrypted = Object.keys(merged).length ? encryptMetaToken(JSON.stringify(merged)) : null
  return prisma.paymentAccount.upsert({ where: { organizationId_provider: { organizationId, provider } },
    update: { config, secretEncrypted, status: "ACTIVE" }, create: { organizationId, provider, config, secretEncrypted } })
}

export async function removePaymentAccount(organizationId: string, provider: Provider) {
  await prisma.paymentAccount.deleteMany({ where: { organizationId, provider } })
}
