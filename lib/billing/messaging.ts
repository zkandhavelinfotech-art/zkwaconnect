import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"

// How WhatsApp message charges are collected. Super admins enable modes and set rates; each workspace uses one mode.
//  DIRECT       – the customer's own payment method in Meta pays Meta; ZKWAConnect charges nothing per message.
//  PLATFORM_FEE – the customer still pays Meta directly; their ZKWAConnect wallet pays a small fee per message.
//  RESELLER     – ZKWAConnect pays Meta (partner credit line); the wallet pays Meta's rate + markup.
export const MODES = ["DIRECT", "PLATFORM_FEE", "RESELLER"] as const
export type Mode = typeof MODES[number]
export const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const
export type Category = typeof CATEGORIES[number]

export const MODE_INFO: Record<Mode, { label: string; short: string; summary: string }> = {
  DIRECT: { label: "Pay Meta directly", short: "Direct", summary: "Add your card in Meta's WhatsApp Manager. Meta bills you; no per-message charge from ZKWAConnect." },
  PLATFORM_FEE: { label: "Meta direct + platform fee", short: "Platform fee", summary: "Meta bills your card for messages; your ZKWAConnect wallet pays a small fee per message." },
  RESELLER: { label: "All-inclusive wallet", short: "Wallet", summary: "No card needed at Meta. Top up your ZKWAConnect wallet; each message is charged from it." },
}

const rates = z.object({ MARKETING: z.number().min(0).max(100), UTILITY: z.number().min(0).max(100), AUTHENTICATION: z.number().min(0).max(100) })
export const settingsSchema = z.object({
  enabledModes: z.array(z.enum(MODES)).min(1, "Enable at least one charging option."),
  defaultMode: z.enum(MODES),
  currency: z.string().length(3).default("INR"),
  // Meta's per-message rate for your customers' main market. Check Meta's current rate card and keep these up to date.
  metaRates: rates,
  platformFee: rates,
  resellerMarkupPercent: z.number().min(0).max(500),
  minTopup: z.number().min(1).max(1_000_000),
  lowBalanceThreshold: z.number().min(0).max(1_000_000),
  showComparisonToCustomers: z.boolean(),
  ratesNote: z.string().max(300).default(""),
}).refine(value => value.enabledModes.includes(value.defaultMode), { message: "The default option must be one of the enabled options.", path: ["defaultMode"] })
export type MessagingSettings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: MessagingSettings = {
  enabledModes: ["DIRECT"], defaultMode: "DIRECT", currency: "INR",
  metaRates: { MARKETING: 0.7846, UTILITY: 0.115, AUTHENTICATION: 0.115 },
  platformFee: { MARKETING: 0.05, UTILITY: 0.02, AUTHENTICATION: 0.02 },
  resellerMarkupPercent: 20, minTopup: 500, lowBalanceThreshold: 100, showComparisonToCustomers: true,
  ratesNote: "Meta rates are defaults for India — check Meta's current WhatsApp rate card.",
}
const KEY = "messaging_billing"

export async function getMessagingSettings(): Promise<MessagingSettings> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } })
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(row?.value as object || {}) })
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

export async function saveMessagingSettings(value: MessagingSettings) {
  await prisma.platformSetting.upsert({ where: { key: KEY }, update: { value: value as Prisma.InputJsonValue }, create: { key: KEY, value: value as Prisma.InputJsonValue } })
}

export function effectiveMode(settings: MessagingSettings, chosen: string | null | undefined): Mode {
  return chosen && settings.enabledModes.includes(chosen as Mode) ? chosen as Mode : settings.defaultMode
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000

// What one message costs in a mode: paid to Meta by the customer, and charged to the ZKWAConnect wallet.
export function priceOf(settings: MessagingSettings, mode: Mode, category: Category) {
  const meta = settings.metaRates[category]
  if (mode === "DIRECT") return { payToMeta: meta, wallet: 0 }
  if (mode === "PLATFORM_FEE") return { payToMeta: meta, wallet: settings.platformFee[category] }
  return { payToMeta: 0, wallet: round4(meta * (1 + settings.resellerMarkupPercent / 100)) }
}

export function normalizeCategory(value: string | null | undefined): Category {
  const upper = (value || "").toUpperCase()
  return (CATEGORIES as readonly string[]).includes(upper) ? upper as Category : "MARKETING"
}

export type Volumes = Record<Category, number>
export function compareCosts(settings: MessagingSettings, volumes: Volumes, modes: readonly Mode[] = MODES) {
  return modes.map(mode => {
    let payToMeta = 0, wallet = 0
    for (const category of CATEGORIES) {
      const price = priceOf(settings, mode, category)
      payToMeta += price.payToMeta * (volumes[category] || 0)
      wallet += price.wallet * (volumes[category] || 0)
    }
    return { mode, ...MODE_INFO[mode], payToMeta: round4(payToMeta), wallet: round4(wallet), total: round4(payToMeta + wallet) }
  }).sort((a, b) => a.total - b.total)
}

// Template messages sent in the last N days by category (what Meta bills), for the comparison.
export async function templateUsage(organizationId: string, days = 30): Promise<Volumes> {
  const rows = await prisma.$queryRaw<{ category: string | null; count: number }[]>`
    SELECT t.category, COUNT(*)::int AS count
    FROM messages m JOIN conversations c ON c.id = m."conversationId" JOIN templates t ON t.id = m.metadata->>'templateId'
    WHERE c."organizationId" = ${organizationId} AND m.direction = 'OUTBOUND' AND m.type = 'TEMPLATE' AND m.status <> 'FAILED'
      AND m."createdAt" >= ${new Date(Date.now() - days * 86_400_000)}
    GROUP BY 1`
  const volumes: Volumes = { MARKETING: 0, UTILITY: 0, AUTHENTICATION: 0 }
  for (const row of rows) volumes[normalizeCategory(row.category)] += row.count
  return volumes
}

export class InsufficientBalanceError extends Error {
  readonly status = 402
  constructor(readonly needed: number, readonly balance: number, currency = "INR") {
    super(`Your WhatsApp wallet balance is too low (needs ${currency} ${needed.toFixed(2)}, balance ${currency} ${balance.toFixed(2)}). Top up under Billing → Messaging costs.`)
    this.name = "InsufficientBalanceError"
  }
}

// Charge the wallet for one template message, before it's sent. Utility templates inside an open
// customer-service window are free on Meta, so they're free here too. Returns the ledger entry to refund on failure.
export async function chargeTemplateMessage(input: { organizationId: string; category: string | null; inServiceWindow: boolean
  conversationId?: string; campaignId?: string; reason: string }) {
  const [settings, org] = await Promise.all([
    getMessagingSettings(),
    prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId }, select: { messagingBillingMode: true, currency: true, billingExempt: true } }),
  ])
  if (org.billingExempt) return null
  const mode = effectiveMode(settings, org.messagingBillingMode)
  const category = normalizeCategory(input.category)
  if (mode === "DIRECT" || (category === "UTILITY" && input.inServiceWindow)) return null
  const price = priceOf(settings, mode, category)
  if (price.wallet <= 0) return null
  const debited = await prisma.$queryRaw<{ walletBalance: Prisma.Decimal }[]>`
    UPDATE organizations SET "walletBalance" = "walletBalance" - ${price.wallet} WHERE id = ${input.organizationId} AND "walletBalance" >= ${price.wallet}
    RETURNING "walletBalance"`
  if (!debited.length) {
    const current = await prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId }, select: { walletBalance: true } })
    throw new InsufficientBalanceError(price.wallet, Number(current.walletBalance), org.currency)
  }
  const balanceAfter = Number(debited[0].walletBalance)
  const entry = await prisma.walletTransaction.create({ data: { organizationId: input.organizationId, type: "DEBIT", amount: -price.wallet, balanceAfter,
    reason: input.reason.slice(0, 200), category, mode, metaCost: mode === "RESELLER" ? settings.metaRates[category] : null,
    conversationId: input.conversationId, campaignId: input.campaignId } })
  if (balanceAfter < settings.lowBalanceThreshold) await lowBalanceAlert(input.organizationId, balanceAfter, org.currency)
  return entry.id
}

// Undo a charge when WhatsApp didn't accept the message. Safe to call twice (refundOf is unique).
export async function refundCharge(transactionId: string | null | undefined, reason = "Refund: message not accepted by WhatsApp") {
  if (!transactionId) return
  const original = await prisma.walletTransaction.findUnique({ where: { id: transactionId } })
  if (!original || original.type !== "DEBIT") return
  if (await prisma.walletTransaction.findUnique({ where: { refundOf: original.id }, select: { id: true } })) return
  try {
    await prisma.$transaction(async tx => {
      const amount = -Number(original.amount)
      const updated = await tx.organization.update({ where: { id: original.organizationId }, data: { walletBalance: { increment: amount } }, select: { walletBalance: true } })
      await tx.walletTransaction.create({ data: { organizationId: original.organizationId, type: "REFUND", amount, balanceAfter: updated.walletBalance,
        reason, category: original.category, mode: original.mode, refundOf: original.id, conversationId: original.conversationId, campaignId: original.campaignId } })
    })
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error // already refunded
  }
}

export async function creditWallet(tx: Prisma.TransactionClient, input: { organizationId: string; amount: number; type: "TOPUP" | "ADJUSTMENT"
  reason: string; invoiceId?: string; createdById?: string }) {
  const updated = await tx.organization.update({ where: { id: input.organizationId }, data: { walletBalance: { increment: input.amount }, lowBalanceAlertAt: null },
    select: { walletBalance: true } })
  if (Number(updated.walletBalance) < 0) throw new Error("This adjustment would make the wallet balance negative.")
  return tx.walletTransaction.create({ data: { organizationId: input.organizationId, type: input.type, amount: input.amount, balanceAfter: updated.walletBalance,
    reason: input.reason.slice(0, 200), invoiceId: input.invoiceId, createdById: input.createdById } })
}

async function lowBalanceAlert(organizationId: string, balance: number, currency: string) {
  const claimed = await prisma.organization.updateMany({ where: { id: organizationId, OR: [{ lowBalanceAlertAt: null }, { lowBalanceAlertAt: { lt: new Date(Date.now() - 86_400_000) } }] },
    data: { lowBalanceAlertAt: new Date() } })
  if (claimed.count) await prisma.notification.create({ data: { organizationId, type: "WALLET_LOW", title: "WhatsApp wallet is running low",
    message: `Balance ${currency} ${balance.toFixed(2)}. Top up under Billing → Messaging costs so broadcasts and templates keep sending.` } }).catch(() => null)
}

// True when the customer messaged this conversation's number in the last 24 h (service window open).
export async function serviceWindowOpen(conversationId: string) {
  const last = await prisma.message.findFirst({ where: { conversationId, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
  return Boolean(last && Date.now() - last.createdAt.getTime() < 24 * 60 * 60 * 1000)
}
