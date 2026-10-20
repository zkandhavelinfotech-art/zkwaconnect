import { prisma } from "@/lib/db/prisma"
import { assertCanSend, assertFeature } from "@/lib/billing/limits"
import { graphVersion, MetaApiError } from "@/lib/meta/graph"
import { decryptMetaToken } from "@/lib/meta/token"

const WINDOW_MS = 24 * 60 * 60 * 1000

async function pageCall<T>(path: string, pageToken: string, init: RequestInit = {}) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${path}`, { ...init, cache: "no-store",
    headers: { Authorization: `Bearer ${pageToken}`, ...(init.body ? { "Content-Type": "application/json" } : {}) }, signal: AbortSignal.timeout(20000) })
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } }
  if (!response.ok || body.error) throw new MetaApiError(body.error?.message || "Instagram request failed", body.error?.code ?? null, response.status)
  return body
}

// Reply to an Instagram DM from the inbox (text; Instagram allows replies within 24 h of the customer's last message).
export async function sendInstagramText(conversationId: string, text: string, senderUserId?: string) {
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { instagramAccount: true, contact: true } })
  if (!conversation.instagramAccount || !conversation.contact.instagramId) throw new Error("This Instagram chat is no longer connected.")
  const last = await prisma.message.findFirst({ where: { conversationId, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
  if (!last || Date.now() - last.createdAt.getTime() > WINDOW_MS)
    throw new Error("Instagram only allows replies within 24 hours of the customer's last message.")
  await assertCanSend(conversation.organizationId)
  await assertFeature(conversation.organizationId, "instagram")
  const account = conversation.instagramAccount
  const result = await pageCall<{ message_id?: string }>(`${account.pageId}/messages`, decryptMetaToken(account.pageTokenEncrypted), {
    method: "POST", body: JSON.stringify({ recipient: { id: conversation.contact.instagramId }, message: { text: text.slice(0, 1000) } }) })
  await prisma.message.create({ data: { conversationId, externalMessageId: result.message_id, direction: "OUTBOUND", type: "TEXT", content: text,
    status: "SENT", sentAt: new Date(), senderUserId, metadata: { channel: "INSTAGRAM", source: "INBOX" } } })
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
  return result.message_id
}

export { pageCall }
