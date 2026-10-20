import { prisma } from "@/lib/db/prisma"

const RANK: Record<string, number> = { QUEUED: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4 }
export type WhatsAppStatus = { id: string; status: string; timestamp?: string
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] }

const at = (timestamp?: string) => timestamp && /^\d+$/.test(timestamp) ? new Date(Number(timestamp) * 1000) : new Date()

// Applies a WhatsApp delivery status (sent / delivered / read / failed) to the broadcast recipient it belongs to.
// Statuses can arrive out of order, so a recipient only ever moves forward (read never goes back to delivered).
export async function applyRecipientStatus(status: WhatsAppStatus) {
  const recipient = await prisma.campaignRecipient.findFirst({ where: { externalMessageId: status.id },
    select: { id: true, status: true, contactId: true, deliveredAt: true } })
  if (!recipient) return false
  const when = at(status.timestamp)
  const next = status.status.toUpperCase()
  if (next === "FAILED") {
    if ((RANK[recipient.status] ?? 0) >= RANK.DELIVERED) return true
    const error = status.errors?.[0]
    await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "FAILED", failedAt: when,
      errorCode: error?.code ? String(error.code) : null,
      errorMessage: [error?.title || error?.message || "WhatsApp could not deliver this message", error?.error_data?.details].filter(Boolean).join(" — ").slice(0, 500) } })
    if (error?.code === 131050 && recipient.contactId)
      await prisma.contact.update({ where: { id: recipient.contactId }, data: { optedIn: false } }).catch(() => null)
    return true
  }
  if (!(next in RANK) || recipient.status === "FAILED" && next === "SENT") return true
  if ((RANK[next] ?? 0) <= (RANK[recipient.status] ?? 0) && recipient.status !== "FAILED") return true
  await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: next,
    ...(next === "DELIVERED" || next === "READ" ? { deliveredAt: recipient.deliveredAt || when } : {}),
    ...(next === "READ" ? { readAt: when } : {}),
    ...(recipient.status === "FAILED" ? { failedAt: null, errorCode: null, errorMessage: null } : {}) } })
  return true
}

// A customer message within 3 days of a broadcast counts as a reply to it.
export async function markBroadcastReply(contactId: string, when = new Date()) {
  await prisma.campaignRecipient.updateMany({
    where: { contactId, repliedAt: null, status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gte: new Date(when.getTime() - 3 * 86_400_000), lte: when } },
    data: { repliedAt: when },
  })
}
