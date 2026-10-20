import { NextResponse } from "next/server"
import { consentSettings, DEFAULT_OPT_IN, DEFAULT_OPT_OUT } from "@/lib/inbox/consent"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, MANAGER_ROLES, requireMember } from "@/lib/auth/member"
import { getInboxSettings, hoursSchema, isOpen } from "@/lib/inbox/automation"

export async function GET() {
  try {
    const { organizationId, role } = await requireMember()
    const [settings, members] = await Promise.all([
      getInboxSettings(organizationId),
      prisma.membership.findMany({ where: { organizationId, status: "ACTIVE" }, select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    ])
    const { lastAssignedUserId: _, ...view } = settings
    const consent = await consentSettings(organizationId)
    return NextResponse.json({ settings: { ...view, optOutEnabled: consent.enabled, optOutKeywords: consent.optOutKeywords, optInKeywords: consent.optInKeywords,
      optOutMessage: consent.optOutMessage, optInMessage: consent.optInMessage }, openNow: isOpen(settings), canEdit: MANAGER_ROLES.includes(role),
      members: members.map(member => ({ ...member.user, role: member.role })) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) })
  }
}

const schema = z.object({
  autoAssign: z.enum(["OFF", "ROUND_ROBIN", "LEAST_BUSY"]),
  agentIds: z.array(z.string().min(1)).max(200),
  businessHoursEnabled: z.boolean(),
  timezone: z.string().refine(zone => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true } catch { return false } }, "Unknown timezone."),
  hours: hoursSchema,
  awayMessage: z.string().trim().max(4096),
  awayCooldownMinutes: z.number().int().min(15).max(10080),
  optOutEnabled: z.boolean().default(true),
  optOutKeywords: z.array(z.string().trim().min(2).max(40)).max(20).default([]),
  optInKeywords: z.array(z.string().trim().min(2).max(40)).max(20).default([]),
  optOutMessage: z.string().trim().max(1024).default(""),
  optInMessage: z.string().trim().max(1024).default(""),
}).superRefine((value, ctx) => {
  for (const [day, slots] of Object.entries(value.hours))
    for (const slot of slots) if (slot.open >= slot.close) ctx.addIssue({ code: "custom", path: ["hours", day], message: `${day.toUpperCase()}: closing time must be after opening time.` })
  if (value.businessHoursEnabled && !value.awayMessage) ctx.addIssue({ code: "custom", path: ["awayMessage"], message: "Write the away message, or turn business hours off." })
})

export async function PUT(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const input = schema.parse(await request.json())
    const valid = await prisma.membership.findMany({ where: { organizationId, status: "ACTIVE", userId: { in: input.agentIds } }, select: { userId: true } })
    const data = { ...input, agentIds: valid.map(member => member.userId), hours: input.hours as Prisma.InputJsonValue,
      optOutKeywords: input.optOutKeywords.length ? input.optOutKeywords : DEFAULT_OPT_OUT, optInKeywords: input.optInKeywords.length ? input.optInKeywords : DEFAULT_OPT_IN }
    await prisma.inboxSettings.upsert({ where: { organizationId }, update: data, create: { organizationId, ...data } })
    return NextResponse.json({ ok: true, message: "Inbox settings saved." })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed"
    return NextResponse.json({ error: message }, { status: errorStatus(error) })
  }
}
