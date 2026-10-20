import { NextResponse } from "next/server"
import { assertFeature, planState } from "@/lib/billing/limits"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma }        from "@/lib/db/prisma"
import { getSession }    from "@/lib/auth/session"
import { audienceWhere, labelsOf } from "@/lib/campaigns/audience"
import { NOT_RETRYABLE_CODES } from "@/lib/campaigns/errors"
import { mappingProblems, readMapping, templateVariableNumbers, variableSourceSchema } from "@/lib/campaigns/variables"
import { sendRatePerSecond } from "@/lib/campaigns/worker"
import { campaignStats } from "@/lib/campaigns/stats"

async function getOrg() {
  const session = await getSession()
  const m = session?.user.memberships.find(m => m.status === "ACTIVE")
  if (!m) throw Object.assign(new Error("Unauthorized"), { status: 401 })
  return { organizationId: m.organizationId, role: m.role }
}

export async function GET(req: Request) {
  try {
    const { organizationId } = await getOrg()
    const url    = new URL(req.url)
    if (url.searchParams.has("estimate")) {
      const labels = (url.searchParams.get("labels") || "").split(",").map(label => label.trim()).filter(Boolean)
      const segment = url.searchParams.get("segment")
      const where = await audienceWhere(organizationId, segment ? "SEGMENT" : labels.length ? "TAGS" : "ALL", labels, segment)
      const [count, sample] = await Promise.all([
        prisma.contact.count({ where }),
        prisma.contact.findFirst({ where, orderBy: { createdAt: "desc" }, select: { name: true, phone: true, email: true, metadata: true } }),
      ])
      return NextResponse.json({ count, sample })
    }
    const status = url.searchParams.get("status")
    const [campaigns, phoneNumbers, templates, audienceTags, attributeKeys, segments] = await Promise.all([
      prisma.campaign.findMany({
        where:   { organizationId, ...(status ? { status } : {}) },
        include: {
          phoneNumber: { select: { displayName:true, phoneNumber:true } },
          template:    { select: { name:true, language:true, status:true, content:true } },
        },
        orderBy: { createdAt: "desc" }, take: 100,
      }),
      prisma.phoneNumber.findMany({
        where: { waba: { organizationId }, status: "CONNECTED" },
        select: { id:true, phoneNumber:true, displayName:true, wabaId:true, messagingLimit:true },
      }),
      prisma.template.findMany({ where: { organizationId }, orderBy: { updatedAt:"desc" },
        select: { id:true, name:true, language:true, status:true, content:true, category:true, wabaId:true } }),
      prisma.$queryRaw<{ tag:string; count:number }[]>`
        SELECT tag, COUNT(*)::int AS count
        FROM contacts, jsonb_array_elements_text(CASE WHEN jsonb_typeof(tags) = 'array' THEN tags ELSE '[]'::jsonb END) AS tag
        WHERE "organizationId" = ${organizationId} AND "optedIn" = true
        GROUP BY tag ORDER BY count DESC, tag ASC LIMIT 200`,
      prisma.$queryRaw<{ key:string }[]>`
        SELECT DISTINCT key FROM contacts, jsonb_object_keys(CASE WHEN jsonb_typeof(metadata->'attributes') = 'object' THEN metadata->'attributes' ELSE '{}'::jsonb END) AS key
        WHERE "organizationId" = ${organizationId} ORDER BY key LIMIT 100`,
      prisma.segment.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ])
    const stats = await campaignStats(campaigns.map(campaign => campaign.id))
    return NextResponse.json({
      campaigns: campaigns.map(campaign => ({ ...campaign, stats: stats.get(campaign.id) })),
      phoneNumbers, templates, audienceTags, attributeKeys: attributeKeys.map(row => row.key).filter(key => !["name", "email"].includes(key)),
      sendRate: sendRatePerSecond(), segments,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: (e as { status?: number }).status || 400 })
  }
}

const MAX_SCHEDULE_DAYS = 90

const createSchema = z.object({
  name: z.string().trim().min(2, "Give the broadcast a name.").max(100),
  phoneNumberId: z.string().min(1, "Choose a WhatsApp number."),
  templateId: z.string().min(1, "Choose an approved template."),
  audienceType: z.enum(["ALL", "TAGS", "SEGMENT"]),
  segmentId: z.string().optional(),
  audienceLabels: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  variables: z.record(z.string().regex(/^\d{1,2}$/), variableSourceSchema).default({}),
  when: z.enum(["draft", "now", "schedule"]).default("draft"),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
})

function scheduleError(when: Date) {
  if (when.getTime() < Date.now() + 60_000) return "Pick a time at least 1 minute from now."
  if (when.getTime() > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) return `Broadcasts can be scheduled up to ${MAX_SCHEDULE_DAYS} days ahead.`
  return null
}

export async function POST(req: Request) {
  try {
    const { organizationId } = await getOrg()
    const input = createSchema.parse(await req.json())
    if (input.audienceType === "TAGS" && input.audienceLabels.length === 0)
      return NextResponse.json({ error: "Choose at least one contact tag." }, { status: 400 })

    const [phoneNumber, template] = await Promise.all([
      prisma.phoneNumber.findFirst({ where: { id: input.phoneNumberId, waba: { organizationId }, status: "CONNECTED" } }),
      prisma.template.findFirst({ where: { id: input.templateId, organizationId, status: "APPROVED" } }),
    ])
    if (!phoneNumber) return NextResponse.json({ error: "Choose a connected phone number in this workspace." }, { status: 400 })
    if (!template) return NextResponse.json({ error: "Choose an approved WhatsApp template." }, { status: 400 })
    if (template.wabaId !== phoneNumber.wabaId)
      return NextResponse.json({ error: "The selected template belongs to a different WhatsApp account." }, { status: 400 })

    const numbers = templateVariableNumbers(template.content)
    const variables = Object.fromEntries(numbers.map(number => [number, input.variables[number]]).filter(([, value]) => value))
    const problems = mappingProblems(numbers, variables)
    if (problems.length) return NextResponse.json({ error: problems[0] }, { status: 400 })
    if (numbers.some(number => input.variables[number]?.source === "link")) await assertFeature(organizationId, "clickTracking")

    if (input.when !== "draft") {
      const plan = await planState(organizationId)
      if (!plan.active) return NextResponse.json({ error: "Your plan has expired, so broadcasts can't be sent. Renew under Billing first." }, { status: 402 })
    }
    let scheduledAt: Date | null = null
    if (input.when === "schedule") {
      if (!input.scheduledAt) return NextResponse.json({ error: "Pick the date and time to send." }, { status: 400 })
      scheduledAt = new Date(input.scheduledAt)
      const problem = scheduleError(scheduledAt)
      if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    } else if (input.when === "now") scheduledAt = new Date()

    const totalCount = await prisma.contact.count({ where: await audienceWhere(organizationId, input.audienceType, input.audienceLabels, input.segmentId) })
    if (input.when !== "draft" && !totalCount) return NextResponse.json({ error: "No opted-in contacts match this audience." }, { status: 400 })

    const campaign = await prisma.campaign.create({
      data: {
        organizationId, phoneNumberId: phoneNumber.id, templateId: template.id, name: input.name,
        audienceType: input.audienceType, audienceLabels: input.audienceType === "TAGS" ? input.audienceLabels : undefined,
        segmentId: input.audienceType === "SEGMENT" ? input.segmentId : null,
        variableMapping: variables as Prisma.InputJsonValue, totalCount,
        status: input.when === "draft" ? "DRAFT" : "SCHEDULED", scheduledAt,
      },
    })
    const message = input.when === "now" ? `Sending to ${totalCount.toLocaleString("en-IN")} contact(s) now.`
      : input.when === "schedule" ? `Scheduled for ${scheduledAt!.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST.`
      : "Draft saved."
    return NextResponse.json({ campaign, message }, { status: 201 })
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not create the broadcast."
    return NextResponse.json({ error: message }, { status: (e as { status?: number }).status || 400 })
  }
}

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["launch", "schedule", "pause", "resume", "cancel", "retry_failed", "delete"]),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
})

export async function PATCH(req: Request) {
  try {
    const { organizationId } = await getOrg()
    const { id, action, scheduledAt } = actionSchema.parse(await req.json())
    const campaign = await prisma.campaign.findFirst({ where: { id, organizationId }, include: { template: true } })
    if (!campaign) return NextResponse.json({ error: "Broadcast not found." }, { status: 404 })
    const is = (...statuses: string[]) => statuses.includes(campaign.status)
    const conflict = (message: string) => NextResponse.json({ error: message }, { status: 409 })

    if (action === "launch" || action === "schedule") {
      if (!is("DRAFT", "SCHEDULED")) return conflict("Only drafts and scheduled broadcasts can be sent or rescheduled.")
      if (campaign.template?.status !== "APPROVED") return NextResponse.json({ error: "The template is no longer approved." }, { status: 400 })
      const problems = mappingProblems(templateVariableNumbers(campaign.template.content), readMapping(campaign.variableMapping, campaign.templateParameters))
      if (problems.length) return NextResponse.json({ error: problems[0] }, { status: 400 })
      const when = action === "launch" ? new Date() : scheduledAt ? new Date(scheduledAt) : null
      if (!when) return NextResponse.json({ error: "Pick the date and time to send." }, { status: 400 })
      if (!(await planState(organizationId)).active) return NextResponse.json({ error: "Your plan has expired, so broadcasts can't be sent. Renew under Billing first." }, { status: 402 })
      if (action === "schedule") { const problem = scheduleError(when); if (problem) return NextResponse.json({ error: problem }, { status: 400 }) }
      const count = await prisma.contact.count({ where: await audienceWhere(organizationId, campaign.audienceType, labelsOf(campaign.audienceLabels), campaign.segmentId) })
      if (!count) return NextResponse.json({ error: "No opted-in contacts match this audience." }, { status: 400 })
      const updated = await prisma.campaign.updateMany({ where: { id, status: { in: ["DRAFT", "SCHEDULED"] } }, data: { status: "SCHEDULED", scheduledAt: when, totalCount: count } })
      if (!updated.count) return conflict("This broadcast has already started.")
      return NextResponse.json({ ok: true, message: action === "launch" ? `Sending to ${count.toLocaleString("en-IN")} contact(s) now.` : "Schedule updated." })
    }

    if (action === "pause") {
      const updated = await prisma.campaign.updateMany({ where: { id, status: { in: ["RUNNING", "SCHEDULED", "STARTING"] } }, data: { status: "PAUSED", pausedReason: "Paused by you." } })
      if (!updated.count) return conflict("Only sending or scheduled broadcasts can be paused.")
      return NextResponse.json({ ok: true, message: "Paused. Messages already handed to WhatsApp can't be recalled." })
    }

    if (action === "resume") {
      if (!is("PAUSED")) return conflict("Only paused broadcasts can be resumed.")
      if (campaign.template?.status !== "APPROVED") return NextResponse.json({ error: "The template is no longer approved, so the broadcast can't resume." }, { status: 400 })
      const materialized = await prisma.campaignRecipient.count({ where: { campaignId: id } })
      await prisma.campaign.update({ where: { id }, data: materialized
        ? { status: "RUNNING", pausedReason: null }
        : { status: "SCHEDULED", scheduledAt: campaign.scheduledAt && campaign.scheduledAt > new Date() ? campaign.scheduledAt : new Date(), pausedReason: null } })
      return NextResponse.json({ ok: true, message: "Resumed." })
    }

    if (action === "cancel") {
      if (!is("DRAFT", "SCHEDULED", "STARTING", "RUNNING", "PAUSED")) return conflict("This broadcast has already finished.")
      await prisma.$transaction([
        prisma.campaign.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } }),
        prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: "QUEUED" },
          data: { status: "SKIPPED", errorCode: "SKIPPED", errorMessage: "Broadcast cancelled before sending.", failedAt: new Date() } }),
      ])
      return NextResponse.json({ ok: true, message: "Cancelled. Contacts not yet messaged will not receive it." })
    }

    if (action === "retry_failed") {
      if (!is("COMPLETED", "PAUSED", "RUNNING", "FAILED")) return conflict("Nothing to retry yet.")
      if (campaign.template?.status !== "APPROVED") return NextResponse.json({ error: "The template is no longer approved." }, { status: 400 })
      const requeued = await prisma.campaignRecipient.updateMany({
        where: { campaignId: id, status: "FAILED", OR: [{ errorCode: null }, { errorCode: { notIn: NOT_RETRYABLE_CODES } }] },
        data: { status: "QUEUED", attempts: 0, nextAttemptAt: new Date(), lockedAt: null, failedAt: null },
      })
      if (!requeued.count) return NextResponse.json({ error: "No failed messages can be retried (numbers not on WhatsApp or opted out are skipped)." }, { status: 400 })
      await prisma.campaign.update({ where: { id }, data: { status: "RUNNING", completedAt: null, pausedReason: null } })
      return NextResponse.json({ ok: true, message: `Retrying ${requeued.count.toLocaleString("en-IN")} failed message(s).` })
    }

    // delete
    if (!is("DRAFT", "CANCELLED", "FAILED") && !(is("COMPLETED") && !(await prisma.campaignRecipient.count({ where: { campaignId: id } }))))
      return conflict("Only drafts, cancelled or failed broadcasts can be deleted (sent broadcasts keep their report).")
    await prisma.campaign.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: "Deleted." })
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: (e as { status?: number }).status || 400 })
  }
}
