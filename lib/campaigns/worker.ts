import { Prisma } from "@/generated/prisma/client"
import { hasFeature } from "@/lib/billing/limits"
import { lockedError } from "@/lib/billing/plans"
import { buildTemplateMessage, trackedButtonComponents } from "@/lib/whatsapp/template-media"
import { assertCanSend, PlanLimitError } from "@/lib/billing/limits"
import { chargeTemplateMessage, InsufficientBalanceError, refundCharge, serviceWindowOpen } from "@/lib/billing/messaging"
import { prisma } from "@/lib/db/prisma"
import { metaGraph } from "@/lib/meta/graph"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { findOrCreateConversation } from "@/lib/whatsapp/conversation"
import { materializeRecipients } from "./audience"
import { classifyFailure, MAX_ATTEMPTS, RETRY_DELAYS_MS } from "./errors"

// Broadcast sender. Each tick: start due scheduled campaigns, then send up to CAMPAIGN_SEND_RATE
// messages (per second) shared across running campaigns. Recipients are claimed with
// FOR UPDATE SKIP LOCKED, so several app instances can run the worker without double sending.

const STALE_LOCK_MS = 2 * 60_000
const STALE_START_MS = 5 * 60_000
const CONCURRENCY = 10

export function sendRatePerSecond() {
  const rate = Number(process.env.CAMPAIGN_SEND_RATE || 20)
  return Number.isFinite(rate) ? Math.min(Math.max(Math.round(rate), 1), 80) : 20
}

type Claimed = { id: string; phone: string; contactId: string | null; variables: Prisma.JsonValue; attempts: number }
type Context = { token: string; metaPhoneNumberId: string; phoneNumberId: string; organizationId: string; content: string
  templateId: string; templateName: string; category: string | null; template: Parameters<typeof trackedButtonComponents>[0]; base: { name: string; language: { code: string }; components?: Record<string, unknown>[] } }

export async function syncCampaignCounts(campaignId: string) {
  const groups = await prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } })
  const count = (...statuses: string[]) => groups.filter(group => statuses.includes(group.status)).reduce((sum, group) => sum + group._count._all, 0)
  await prisma.campaign.update({ where: { id: campaignId }, data: {
    totalCount: count("QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"),
    sentCount: count("SENT", "DELIVERED", "READ"), deliveredCount: count("DELIVERED", "READ"), readCount: count("READ"), failedCount: count("FAILED"),
  } })
}

async function pauseCampaign(campaignId: string, reason: string) {
  await prisma.campaign.updateMany({ where: { id: campaignId, status: "RUNNING" }, data: { status: "PAUSED", pausedReason: reason.slice(0, 500) } })
  await prisma.notification.create({ data: { organizationId: (await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).organizationId,
    type: "CAMPAIGN_PAUSED", title: "Broadcast paused", message: `A broadcast was paused: ${reason.slice(0, 300)}` } }).catch(() => null)
}

export async function startDueCampaigns(now = new Date()) {
  const due = await prisma.campaign.findMany({
    where: { OR: [{ status: "SCHEDULED", scheduledAt: { lte: now } }, { status: "STARTING", updatedAt: { lt: new Date(now.getTime() - STALE_START_MS) } }] },
    select: { id: true }, orderBy: { scheduledAt: "asc" }, take: 10,
  })
  for (const { id } of due) {
    const claimed = await prisma.campaign.updateMany({ where: { id, OR: [{ status: "SCHEDULED" }, { status: "STARTING", updatedAt: { lt: new Date(now.getTime() - STALE_START_MS) } }] },
      data: { status: "STARTING" } })
    if (!claimed.count) continue
    try {
      const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id }, include: { template: true } })
      if (campaign.template?.status !== "APPROVED") throw new Error("The template is no longer approved by WhatsApp.")
      if (!(await hasFeature(campaign.organizationId, "broadcasts"))) throw await lockedError("broadcasts")
      await materializeRecipients(id)
      const queued = await prisma.campaignRecipient.count({ where: { campaignId: id } })
      if (!queued) throw new Error("No opted-in contacts matched the audience when the broadcast started.")
      await prisma.campaign.update({ where: { id }, data: { status: "RUNNING", startedAt: campaign.startedAt || new Date(), pausedReason: null } })
      await syncCampaignCounts(id)
    } catch (error) {
      await prisma.campaign.update({ where: { id }, data: { status: "FAILED", completedAt: new Date(),
        pausedReason: error instanceof Error ? error.message.slice(0, 500) : "Could not start the broadcast." } })
    }
  }
  return due.length
}

async function claimBatch(campaignId: string, limit: number) {
  return prisma.$queryRaw<Claimed[]>`
    UPDATE campaign_recipients SET status = 'SENDING', "lockedAt" = now(), "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM campaign_recipients
      WHERE "campaignId" = ${campaignId} AND status = 'QUEUED' AND "nextAttemptAt" <= now()
      ORDER BY "createdAt", id LIMIT ${limit}
      FOR UPDATE SKIP LOCKED)
    RETURNING id, phone, "contactId", variables, attempts`
}

async function releaseClaims(ids: string[]) {
  if (ids.length) await prisma.campaignRecipient.updateMany({ where: { id: { in: ids }, status: "SENDING" }, data: { status: "QUEUED", lockedAt: null } })
}

async function prepare(campaignId: string): Promise<Context | string> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { template: true, phoneNumber: true } })
  if (!campaign.template || campaign.template.status !== "APPROVED") return "The template is no longer approved by WhatsApp."
  if (!(await hasFeature(campaign.organizationId, "broadcasts"))) return (await lockedError("broadcasts")).message
  if (campaign.phoneNumber.status !== "CONNECTED") return "The WhatsApp number is no longer connected."
  const token = await getMetaAccessToken(campaign.organizationId)
  if (!token) return "Meta is not connected for this workspace. Reconnect Facebook, then resume."
  try {
    // Media headers / carousel cards are uploaded once (cached); body values are added per recipient.
    const base = await buildTemplateMessage(campaign.template, [], { accessToken: token, metaPhoneNumberId: campaign.phoneNumber.phoneNumberId }, { links: false })
    return { token, base, metaPhoneNumberId: campaign.phoneNumber.phoneNumberId, phoneNumberId: campaign.phoneNumberId, organizationId: campaign.organizationId,
      content: campaign.template.content || campaign.template.name, templateId: campaign.template.id, templateName: campaign.template.name, category: campaign.template.category, template: campaign.template }
  } catch (error) {
    return error instanceof Error ? error.message : "Could not prepare the template."
  }
}

async function withTrackedButtons(context: Context, campaignId: string, recipient: Claimed, message: Context["base"]) {
  const extra = await trackedButtonComponents(context.template, { organizationId: context.organizationId, campaignId, recipientId: recipient.id, contactId: recipient.contactId || undefined })
  return extra.length ? { ...message, components: [...(message.components || []), ...extra] } : message
}

export function templateFor(base: Context["base"], values: string[]) {
  if (!values.length) return base
  const components = [...(base.components || [])]
  const body = { type: "body", parameters: values.map(text => ({ type: "text", text })) }
  const headerIndex = components.findIndex(component => component.type === "header")
  components.splice(headerIndex + 1, 0, body)
  return { ...base, components }
}

function fill(content: string, values: string[]) {
  return content.replace(/\{\{(\d+)\}\}/g, (match, number) => values[Number(number) - 1] ?? match)
}

async function sendOne(campaignId: string, context: Context, recipient: Claimed): Promise<string | null> {
  const values = Array.isArray(recipient.variables) ? recipient.variables.map(String) : []
  const now = new Date()
  let messageId: string | undefined
  // Plan check and wallet charge first. An expired plan, the monthly limit or a low balance pauses the whole broadcast.
  let charge: string | null = null
  try {
    await assertCanSend(context.organizationId)
    let inWindow = false
    if (recipient.contactId && (context.category || "").toUpperCase() === "UTILITY") {
      const conversation = await prisma.conversation.findFirst({ where: { contactId: recipient.contactId, phoneNumberId: context.phoneNumberId }, select: { id: true } })
      inWindow = conversation ? await serviceWindowOpen(conversation.id) : false
    }
    charge = await chargeTemplateMessage({ organizationId: context.organizationId, category: context.category, inServiceWindow: inWindow,
      campaignId, reason: `Broadcast “${context.templateName}” to +${recipient.phone}` })
  } catch (error) {
    if (error instanceof InsufficientBalanceError || error instanceof PlanLimitError) { await releaseClaims([recipient.id]); return error.message }
    throw error
  }
  try {
    const result = await metaGraph<{ messages?: { id: string }[] }>(`${context.metaPhoneNumberId}/messages`, context.token, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient.phone, type: "template", template: await withTrackedButtons(context, campaignId, recipient, templateFor(context.base, values)) }),
    })
    messageId = result.messages?.[0]?.id
  } catch (error) {
    await refundCharge(charge)
    const failure = classifyFailure(error)
    if (failure.kind === "pause") {
      await releaseClaims([recipient.id])
      return `${failure.message}${failure.code ? ` (code ${failure.code})` : ""}`
    }
    const attempts = recipient.attempts + 1
    const retry = failure.kind === "retry" && attempts < MAX_ATTEMPTS
    await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: {
      attempts, lockedAt: null, errorCode: failure.code, errorMessage: failure.message,
      ...(retry ? { status: "QUEUED", nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]) } : { status: "FAILED", failedAt: now }),
    } })
    if (failure.kind === "opted_out" && recipient.contactId)
      await prisma.contact.update({ where: { id: recipient.contactId }, data: { optedIn: false } }).catch(() => null)
    return null
  }

  await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: {
    status: "SENT", externalMessageId: messageId, sentAt: now, attempts: recipient.attempts + 1, lockedAt: null, errorCode: null, errorMessage: null,
  } })
  // Show the broadcast in the contact's inbox thread. A failure here must not mark the send as failed.
  if (recipient.contactId) {
    try {
      const conversation = await findOrCreateConversation({ organizationId: context.organizationId, phoneNumberId: context.phoneNumberId, contactId: recipient.contactId, reopen: false })
      await prisma.message.create({ data: { conversationId: conversation.id, externalMessageId: messageId, direction: "OUTBOUND", type: "TEMPLATE",
        content: fill(context.content, values), status: "SENT", sentAt: now, metadata: { campaignId, recipientId: recipient.id, templateId: context.templateId } } })
      await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } })
    } catch (error) {
      console.error("[campaigns] could not record message in inbox", error)
    }
  }
  return null
}

async function finishIfDone(campaignId: string) {
  const open = await prisma.campaignRecipient.count({ where: { campaignId, status: { in: ["QUEUED", "SENDING"] } } })
  if (!open) await prisma.campaign.updateMany({ where: { id: campaignId, status: "RUNNING" }, data: { status: "COMPLETED", completedAt: new Date() } })
}

async function runCampaign(campaignId: string, budget: number) {
  const claimed = await claimBatch(campaignId, budget)
  if (!claimed.length) {
    await finishIfDone(campaignId)
    return 0
  }
  const context = await prepare(campaignId)
  if (typeof context === "string") {
    await releaseClaims(claimed.map(item => item.id))
    await pauseCampaign(campaignId, context)
    return 0
  }
  let pauseReason: string | null = null
  const queue = [...claimed]
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (pauseReason) { await releaseClaims([next.id]); continue }
      const reason = await sendOne(campaignId, context, next)
      if (reason) pauseReason = reason
    }
  }))
  if (pauseReason) await pauseCampaign(campaignId, pauseReason)
  await syncCampaignCounts(campaignId)
  await finishIfDone(campaignId)
  return claimed.length
}

// One pass of the sender. Returns true when there was work, so the loop can idle otherwise.
export async function tickCampaigns() {
  const started = await startDueCampaigns()
  await prisma.campaignRecipient.updateMany({ where: { status: "SENDING", lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) } },
    data: { status: "QUEUED", lockedAt: null } })
  const running = await prisma.campaign.findMany({ where: { status: "RUNNING" }, select: { id: true }, orderBy: { startedAt: "asc" }, take: 50 })
  if (!running.length) return started > 0
  const share = Math.max(1, Math.floor(sendRatePerSecond() / running.length))
  for (const { id } of running) {
    try { await runCampaign(id, share) } catch (error) { console.error(`[campaigns] ${id}`, error) }
  }
  return true
}
