import { z } from "zod"
import { emitEvent } from "@/lib/developer/webhooks"
import { prisma } from "@/lib/db/prisma"
import { sendAndRecord } from "@/lib/whatsapp/send"

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
export type Day = typeof DAYS[number]
const slotSchema = z.object({ open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/) })
export const hoursSchema = z.record(z.enum(DAYS), z.array(slotSchema).max(3))
export type Hours = z.infer<typeof hoursSchema>

export const DEFAULT_HOURS: Hours = Object.fromEntries(DAYS.map(day => [day, day === "sun" ? [] : [{ open: "09:00", close: "18:00" }]])) as Hours
export const DEFAULT_AWAY = "Thanks for your message! 🙏 We're away right now and will reply during business hours."

export type InboxSettingsView = {
  autoAssign: "OFF" | "ROUND_ROBIN" | "LEAST_BUSY"; agentIds: string[]
  businessHoursEnabled: boolean; timezone: string; hours: Hours; awayMessage: string; awayCooldownMinutes: number
}

export async function getInboxSettings(organizationId: string): Promise<InboxSettingsView & { lastAssignedUserId: string | null }> {
  const row = await prisma.inboxSettings.findUnique({ where: { organizationId } })
  const hours = hoursSchema.safeParse(row?.hours)
  return {
    autoAssign: (["OFF", "ROUND_ROBIN", "LEAST_BUSY"].includes(row?.autoAssign || "") ? row!.autoAssign : "OFF") as InboxSettingsView["autoAssign"],
    agentIds: Array.isArray(row?.agentIds) ? row!.agentIds.filter((id): id is string => typeof id === "string") : [],
    businessHoursEnabled: row?.businessHoursEnabled ?? false,
    timezone: row?.timezone || "Asia/Kolkata",
    hours: hours.success ? hours.data : DEFAULT_HOURS,
    awayMessage: row?.awayMessage ?? DEFAULT_AWAY,
    awayCooldownMinutes: row?.awayCooldownMinutes ?? 240,
    lastAssignedUserId: row?.lastAssignedUserId ?? null,
  }
}

// Weekday + "HH:MM" for `at` in the given IANA timezone.
export function localTime(at: Date, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(at).map(part => [part.type, part.value]))
  return { day: String(parts.weekday).toLowerCase().slice(0, 3) as Day, time: `${parts.hour}:${parts.minute}` }
}

export function isOpen(settings: Pick<InboxSettingsView, "businessHoursEnabled" | "timezone" | "hours">, at = new Date()) {
  if (!settings.businessHoursEnabled) return true
  const { day, time } = localTime(at, settings.timezone)
  return (settings.hours[day] || []).some(slot => slot.open <= time && time < slot.close)
}

// Assign an unassigned conversation to the next agent (round robin) or the agent with the fewest open chats.
export async function autoAssignConversation(organizationId: string, conversationId: string) {
  const settings = await getInboxSettings(organizationId)
  if (settings.autoAssign === "OFF") return null
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, organizationId }, select: { assignedUserId: true } })
  if (!conversation || conversation.assignedUserId) return null
  const members = await prisma.membership.findMany({ where: { organizationId, status: "ACTIVE", ...(settings.agentIds.length ? { userId: { in: settings.agentIds } } : {}) },
    select: { userId: true }, orderBy: { createdAt: "asc" } })
  const candidates = members.map(member => member.userId)
  if (!candidates.length) return null
  let chosen: string
  if (settings.autoAssign === "ROUND_ROBIN") {
    const previous = settings.lastAssignedUserId ? candidates.indexOf(settings.lastAssignedUserId) : -1
    chosen = candidates[(previous + 1) % candidates.length]
  } else {
    const load = await prisma.conversation.groupBy({ by: ["assignedUserId"], where: { organizationId, status: { in: ["OPEN", "PENDING"] }, assignedUserId: { in: candidates } }, _count: { _all: true } })
    const count = (id: string) => load.find(row => row.assignedUserId === id)?._count._all || 0
    chosen = candidates.reduce((best, id) => count(id) < count(best) ? id : best, candidates[0])
  }
  // Only assign if still unassigned (another message may have raced us).
  const updated = await prisma.conversation.updateMany({ where: { id: conversationId, assignedUserId: null }, data: { assignedUserId: chosen } })
  if (!updated.count) return null
  await prisma.inboxSettings.upsert({ where: { organizationId }, update: { lastAssignedUserId: chosen }, create: { organizationId, lastAssignedUserId: chosen } })
  await emitEvent(organizationId, "conversation.assigned", { conversation_id: conversationId, assigned_user_id: chosen, by: "auto" })
  return chosen
}

// Outside business hours, reply once (per cooldown) with the away message.
export async function sendAwayMessageIfClosed(input: { organizationId: string; conversationId: string; to: string; metaPhoneNumberId: string
  getAccessToken: () => Promise<string>; at?: Date }) {
  const settings = await getInboxSettings(input.organizationId)
  const message = settings.awayMessage.trim()
  const at = input.at || new Date()
  if (!settings.businessHoursEnabled || !message || isOpen(settings, at)) return false
  const cutoff = new Date(at.getTime() - settings.awayCooldownMinutes * 60_000)
  const claimed = await prisma.conversation.updateMany({ where: { id: input.conversationId, OR: [{ awayMessageAt: null }, { awayMessageAt: { lt: cutoff } }] },
    data: { awayMessageAt: at } })
  if (!claimed.count) return false
  await sendAndRecord({ accessToken: await input.getAccessToken(), metaPhoneNumberId: input.metaPhoneNumberId, to: input.to, conversationId: input.conversationId },
    { type: "text", text: { preview_url: false, body: message } }, message, { source: "AWAY_MESSAGE" })
  return true
}
