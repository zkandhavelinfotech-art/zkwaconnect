import webpush from "web-push"
import { prisma } from "@/lib/db/prisma"

// VAPID keys for Web Push are created once and kept in the database (no .env change needed).
let cached: { publicKey: string; privateKey: string } | null = null
export async function vapidKeys() {
  if (cached) return cached
  const row = await prisma.platformSetting.findUnique({ where: { key: "vapid" } })
  const value = row?.value as { publicKey?: string; privateKey?: string } | undefined
  if (value?.publicKey && value.privateKey) return (cached = { publicKey: value.publicKey, privateKey: value.privateKey })
  const keys = webpush.generateVAPIDKeys()
  try { await prisma.platformSetting.create({ data: { key: "vapid", value: { publicKey: keys.publicKey, privateKey: keys.privateKey } } }) }
  catch { const again = await prisma.platformSetting.findUniqueOrThrow({ where: { key: "vapid" } }); return (cached = again.value as { publicKey: string; privateKey: string }) }
  return (cached = keys)
}

export async function sendPush(userIds: string[], payload: { title: string; body: string; url: string; tag?: string }) {
  if (!userIds.length) return 0
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } })
  if (!subscriptions.length) return 0
  const keys = await vapidKeys()
  const subject = process.env.VAPID_SUBJECT || `mailto:${process.env.SUPPORT_EMAIL || "support@zkwaconnect.in"}`
  let sent = 0
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload),
        { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 3600, urgency: "high" })
      sent++
    } catch (error) {
      // Gone / expired subscriptions are removed.
      if ([404, 410].includes((error as { statusCode?: number }).statusCode || 0)) await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => null)
    }
  }))
  return sent
}

// New customer message: alert the assigned agent, or everyone in the workspace when the chat is unassigned.
export async function notifyNewMessage(organizationId: string, conversationId: string, title: string, body: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { assignedUserId: true } })
  const userIds = conversation?.assignedUserId ? [conversation.assignedUserId]
    : (await prisma.membership.findMany({ where: { organizationId, status: "ACTIVE" }, select: { userId: true } })).map(member => member.userId)
  return sendPush(userIds, { title: title.slice(0, 80), body: body.slice(0, 160), url: `/app/inbox?c=${conversationId}`, tag: conversationId })
}
