import { prisma } from "@/lib/db/prisma"
import { sendPush } from "@/lib/push"

// In-app notification (bell) + web push to the workspace's owners and admins.
export async function notifyWorkspace(organizationId: string, type: string, title: string, message: string, url: string, metadata: Record<string, unknown> = {}) {
  await prisma.notification.create({ data: { organizationId, type, title, message, metadata: { url, ...metadata } } })
  const admins = await prisma.membership.findMany({ where: { organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MANAGER"] } }, select: { userId: true } })
  await sendPush(admins.map(member => member.userId), { title, body: message.slice(0, 160), url }).catch(() => 0)
}
