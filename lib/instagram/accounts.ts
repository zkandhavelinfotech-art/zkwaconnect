import { Prisma } from "@/generated/prisma/client"
import { hasFeature } from "@/lib/billing/limits"
import { prisma } from "@/lib/db/prisma"
import { metaGraph } from "@/lib/meta/graph"
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta/token"
import { emitEvent } from "@/lib/developer/webhooks"
import { autoAssignConversation } from "@/lib/inbox/automation"
import { notifyNewMessage } from "@/lib/push"
import { pageCall } from "./client"

type PageRow = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string; profile_picture_url?: string } }

// Facebook Pages the user manages that have a linked Instagram professional account.
export async function pagesWithInstagram(userToken: string) {
  const result = await metaGraph<{ data?: PageRow[] }>("me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&limit=100", userToken)
  return (result.data || []).filter(page => page.instagram_business_account)
}

export async function connectInstagram(organizationId: string, userToken: string, pageId: string) {
  const page = (await pagesWithInstagram(userToken)).find(item => item.id === pageId)
  if (!page?.instagram_business_account) throw Object.assign(new Error("That Page has no linked Instagram professional account."), { status: 404 })
  const taken = await prisma.instagramAccount.findFirst({ where: { OR: [{ pageId }, { igUserId: page.instagram_business_account.id }], organizationId: { not: organizationId } } })
  if (taken) throw Object.assign(new Error("This Instagram account is already connected to another workspace."), { status: 409 })
  // Ask Meta to send this Page's (Instagram) messages to our webhook.
  await pageCall(`${page.id}/subscribed_apps?subscribed_fields=messages`, page.access_token, { method: "POST" })
  const data = { organizationId, pageName: page.name, igUserId: page.instagram_business_account.id, username: page.instagram_business_account.username || page.name,
    pictureUrl: page.instagram_business_account.profile_picture_url || null, pageTokenEncrypted: encryptMetaToken(page.access_token), status: "CONNECTED" }
  return prisma.instagramAccount.upsert({ where: { pageId: page.id }, create: { pageId: page.id, ...data }, update: data })
}

type Messaging = { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string; payload?: { url?: string } }[]; reply_to?: unknown } }

// Instagram webhook: entry.id is the Instagram account; each messaging item is a DM.
export async function handleInstagramEntry(entry: { id?: string; messaging?: Messaging[] }) {
  const account = entry.id ? await prisma.instagramAccount.findUnique({ where: { igUserId: entry.id } }) : null
  if (!account || account.status !== "CONNECTED" || !(await hasFeature(account.organizationId, "instagram"))) return
  for (const event of entry.messaging || []) {
    const message = event.message
    const senderId = event.sender?.id
    if (!message?.mid || !senderId || message.is_echo || senderId === account.igUserId) continue
    if (await prisma.message.findFirst({ where: { externalMessageId: message.mid }, select: { id: true } })) continue
    const at = event.timestamp ? new Date(event.timestamp) : new Date()
    let contact = await prisma.contact.findFirst({ where: { organizationId: account.organizationId, instagramId: senderId } })
    if (!contact) {
      const profile = await pageCall<{ name?: string; username?: string }>(`${senderId}?fields=name,username`, decryptMetaToken(account.pageTokenEncrypted)).catch(() => ({} as { name?: string; username?: string }))
      contact = await prisma.contact.create({ data: { organizationId: account.organizationId, phone: `ig:${senderId}`, instagramId: senderId, source: "INSTAGRAM", optedIn: false,
        name: profile.name || (profile.username ? `@${profile.username}` : null), metadata: { attributes: profile.username ? { instagram: profile.username } : {} } } })
      await emitEvent(account.organizationId, "contact.created", { contact: { id: contact.id, instagram_id: senderId, name: contact.name, source: "INSTAGRAM" } })
    }
    let conversation = await prisma.conversation.findFirst({ where: { organizationId: account.organizationId, contactId: contact.id, instagramAccountId: account.id } })
    conversation = conversation
      ? await prisma.conversation.update({ where: { id: conversation.id }, data: { status: conversation.status === "RESOLVED" ? "OPEN" : conversation.status, lastMessageAt: at, unreadCount: { increment: 1 } } })
      : await prisma.conversation.create({ data: { organizationId: account.organizationId, channel: "INSTAGRAM", instagramAccountId: account.id, contactId: contact.id, status: "OPEN", lastMessageAt: at, unreadCount: 1 } })
    const attachment = message.attachments?.[0]
    const type = attachment?.type === "image" ? "IMAGE" : attachment?.type === "video" ? "VIDEO" : attachment?.type === "audio" ? "AUDIO" : attachment ? "DOCUMENT" : "TEXT"
    const content = message.text || (attachment ? `[${attachment.type || "attachment"}]` : null)
    await prisma.message.create({ data: { conversationId: conversation.id, externalMessageId: message.mid, direction: "INBOUND", type, content, status: "RECEIVED", sentAt: at,
      metadata: { channel: "INSTAGRAM", attachmentUrl: attachment?.payload?.url || null } as Prisma.InputJsonValue } })
    await emitEvent(account.organizationId, "message.received", { channel: "instagram", message_id: message.mid, conversation_id: conversation.id,
      contact: { id: contact.id, instagram_id: senderId, name: contact.name }, type: type.toLowerCase(), text: content, timestamp: at.toISOString() })
    await autoAssignConversation(account.organizationId, conversation.id).catch(() => null)
    await notifyNewMessage(account.organizationId, conversation.id, `${contact.name || "Instagram user"} · Instagram`, content || "New message").catch(() => null)
  }
}
