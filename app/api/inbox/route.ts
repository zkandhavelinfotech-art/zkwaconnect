import { NextResponse } from "next/server"
import { sendInstagramText } from "@/lib/instagram/client"
import { emitEvent } from "@/lib/developer/webhooks"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { sendAndRecord } from "@/lib/whatsapp/send"
import { buildTemplateMessage } from "@/lib/whatsapp/template-media"
import { attachmentRule, storeMedia, uploadToWhatsApp } from "@/lib/whatsapp/media"

export const runtime = "nodejs"

const WINDOW_MS = 24 * 60 * 60 * 1000
const STATUSES = ["OPEN", "PENDING", "RESOLVED"] as const

async function getMember() {
  const session = await getSession()
  const membership = session?.user.memberships.find(item => item.status === "ACTIVE")
  return membership ? { organizationId: membership.organizationId, userId: session!.user.id } : null
}

async function lastInboundAt(conversationId: string) {
  const message = await prisma.message.findFirst({ where:{ conversationId, direction:"INBOUND" },
    orderBy:{ createdAt:"desc" }, select:{ createdAt:true, sentAt:true } })
  return message ? (message.sentAt || message.createdAt) : null
}

const MEDIA_TYPES = ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "STICKER"]

function mediaInfo(type: string, mediaUrl: string | null, metadata: Prisma.JsonValue) {
  if (!MEDIA_TYPES.includes(type)) return null
  const meta = (metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}) as Record<string, unknown>
  const part = meta[type.toLowerCase()] as { id?: string; filename?: string; mime_type?: string } | undefined
  if (!mediaUrl && !part?.id) return null
  return { filename: (typeof meta.filename === "string" ? meta.filename : part?.filename) || null,
    mime: (typeof meta.mime === "string" ? meta.mime : part?.mime_type) || null }
}

export async function GET(request: Request) {
  try {
    const member = await getMember()
    if (!member) return NextResponse.json({ error:"Unauthorized" }, { status:401 })
    const { organizationId } = member
    const url = new URL(request.url)
    const conversationId = url.searchParams.get("conversationId")

    if (conversationId) {
      const conversation = await prisma.conversation.findFirst({
        where:{ id:conversationId, organizationId },
        include:{
          contact:{ select:{ id:true, name:true, phone:true, email:true, tags:true, metadata:true, optedIn:true, source:true, createdAt:true } },
          phoneNumber:{ select:{ phoneNumber:true, displayName:true, wabaId:true } },
          instagramAccount:{ select:{ username:true } },
          assignedUser:{ select:{ id:true, name:true } },
          messages:{ orderBy:{ createdAt:"desc" }, take:300,
            select:{ id:true, direction:true, type:true, content:true, status:true, mediaUrl:true, metadata:true, createdAt:true, sentAt:true,
              deliveredAt:true, readAt:true, senderUser:{ select:{ name:true } } } },
        },
      })
      if (!conversation) return NextResponse.json({ error:"Conversation not found." }, { status:404 })
      if (conversation.unreadCount) await prisma.conversation.update({ where:{ id:conversation.id }, data:{ unreadCount:0 } })
      const [inboundAt, templates, quickReplies, adReferral] = await Promise.all([
        lastInboundAt(conversation.id),
        conversation.phoneNumber ? prisma.template.findMany({ where:{ organizationId, wabaId:conversation.phoneNumber.wabaId, status:"APPROVED" },
          select:{ id:true, name:true, language:true, content:true }, orderBy:{ name:"asc" } }) : Promise.resolve([]),
        prisma.quickReply.findMany({ where:{ organizationId }, select:{ id:true, shortcut:true, content:true }, orderBy:{ shortcut:"asc" } }),
        prisma.adReferral.findFirst({ where:{ conversationId:conversation.id }, orderBy:{ createdAt:"desc" },
          select:{ sourceType:true, sourceId:true, sourceUrl:true, headline:true, body:true, createdAt:true } }),
      ])
      const windowEndsAt = inboundAt ? new Date(inboundAt.getTime() + WINDOW_MS) : null
      // Media details only (the raw WhatsApp payload stays on the server).
      const messages = [...conversation.messages].reverse().map(({ metadata, ...message }) => ({ ...message, media:mediaInfo(message.type, message.mediaUrl, metadata) }))
      return NextResponse.json({
        conversation:{ ...conversation, messages },
        windowOpen: Boolean(windowEndsAt && windowEndsAt > new Date()),
        windowEndsAt, templates, quickReplies, adReferral,
      })
    }

    const status = url.searchParams.get("status") || "OPEN"
    const query = (url.searchParams.get("q") || "").trim()
    const mine = url.searchParams.get("mine") === "1"
    const where: Prisma.ConversationWhereInput = {
      organizationId,
      ...(STATUSES.includes(status as typeof STATUSES[number]) ? { status } : {}),
      ...(mine ? { assignedUserId:member.userId } : {}),
      ...(query ? { contact:{ OR:[
        { name:{ contains:query, mode:"insensitive" } },
        { phone:{ contains:query.replace(/\D/g, "") || query } },
      ] } } : {}),
    }
    const [conversations, counts, members] = await Promise.all([
      prisma.conversation.findMany({
        where, take:100,
        orderBy:[{ lastMessageAt:{ sort:"desc", nulls:"last" } }, { updatedAt:"desc" }],
        include:{
          contact:{ select:{ id:true, name:true, phone:true } },
          instagramAccount:{ select:{ username:true } },
          assignedUser:{ select:{ id:true, name:true } },
          messages:{ orderBy:{ createdAt:"desc" }, take:1, select:{ content:true, type:true, direction:true, createdAt:true } },
        },
      }),
      prisma.conversation.groupBy({ by:["status"], where:{ organizationId }, _count:{ _all:true } }),
      prisma.membership.findMany({ where:{ organizationId, status:"ACTIVE" }, select:{ user:{ select:{ id:true, name:true } } } }),
    ])
    return NextResponse.json({
      conversations,
      counts:Object.fromEntries(counts.map(item => [item.status, item._count._all])),
      members:members.map(item => item.user),
      me:member.userId,
    })
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "Could not load inbox." }, { status:500 })
  }
}

const sendSchema = z.union([
  z.object({ conversationId:z.string().min(1), note:z.string().trim().min(1, "Write the note.").max(4096) }),
  z.object({ conversationId:z.string().min(1), text:z.string().trim().min(1).max(4096) }),
  z.object({ conversationId:z.string().min(1), templateId:z.string().min(1), parameters:z.array(z.string().trim().min(1).max(1024)).max(20).default([]) }),
])

export async function POST(request: Request) {
  try {
    const member = await getMember()
    if (!member) return NextResponse.json({ error:"Unauthorized" }, { status:401 })
    const { organizationId } = member
    if ((request.headers.get("content-type") || "").startsWith("multipart/form-data")) return await sendAttachment(request, member)
    const input = sendSchema.parse(await request.json())
    const conversation = await prisma.conversation.findFirst({ where:{ id:input.conversationId, organizationId },
      include:{ contact:true, phoneNumber:true } })
    if (!conversation) return NextResponse.json({ error:"Conversation not found." }, { status:404 })
    // Internal notes are only visible to the team, never sent to WhatsApp.
    if ("note" in input) {
      await prisma.message.create({ data:{ conversationId:conversation.id, direction:"NOTE", type:"NOTE", content:input.note,
        senderUserId:member.userId, status:"NOTE", sentAt:new Date() } })
      return NextResponse.json({ ok:true }, { status:201 })
    }
    if (conversation.channel === "INSTAGRAM" || !conversation.phoneNumber) {
      if (!("text" in input)) return NextResponse.json({ error:"Templates are WhatsApp-only. Send a text reply on Instagram." }, { status:400 })
      await sendInstagramText(conversation.id, input.text, member.userId)
      await prisma.conversation.update({ where:{ id:conversation.id }, data:{ ...(conversation.assignedUserId ? {} : { assignedUserId:member.userId }) } })
      return NextResponse.json({ ok:true }, { status:201 })
    }
    const phone = conversation.phoneNumber
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error:"Connect Meta before sending messages." }, { status:409 })
    const target = { accessToken, metaPhoneNumberId:phone.phoneNumberId, to:conversation.contact.phone,
      conversationId:conversation.id, senderUserId:member.userId }

    if ("text" in input) {
      const inboundAt = await lastInboundAt(conversation.id)
      if (!inboundAt || Date.now() - inboundAt.getTime() > WINDOW_MS)
        return NextResponse.json({ error:"The 24-hour reply window has closed. Send an approved template to restart the conversation." }, { status:409 })
      await sendAndRecord(target, { type:"text", text:{ preview_url:true, body:input.text } }, input.text, { source:"INBOX" })
    } else {
      const template = await prisma.template.findFirst({ where:{ id:input.templateId, organizationId, status:"APPROVED",
        wabaId:phone.wabaId } })
      if (!template) return NextResponse.json({ error:"Choose an approved template for this WhatsApp number." }, { status:400 })
      const needed = new Set([...(template.content || "").matchAll(/\{\{(\d+)\}\}/g)].map(match => match[1])).size
      if (input.parameters.length < needed)
        return NextResponse.json({ error:`Fill all ${needed} template variable(s).` }, { status:400 })
      const parameters = input.parameters.slice(0, needed)
      const preview = (template.content || template.name).replace(/\{\{(\d+)\}\}/g, (match, number) => parameters[Number(number) - 1] ?? match)
      await sendAndRecord(target, { type:"template", template:await buildTemplateMessage(template, parameters, target) },
        preview, { source:"INBOX", templateId:template.id })
    }
    // A person replied, so stop any chatbot flow waiting on this customer.
    await prisma.conversation.update({ where:{ id:conversation.id }, data:{ flowState:Prisma.JsonNull,
      ...(conversation.assignedUserId ? {} : { assignedUserId:member.userId }) } })
    return NextResponse.json({ ok:true }, { status:201 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Message could not be sent."
    return NextResponse.json({ error:message }, { status:400 })
  }
}

// Photo, video, audio or document from the agent: stored locally, uploaded to WhatsApp, then sent by media ID.
async function sendAttachment(request: Request, member: { organizationId: string; userId: string }) {
  const form = await request.formData()
  const file = form.get("file")
  const caption = String(form.get("caption") || "").trim().slice(0, 1024)
  const conversation = await prisma.conversation.findFirst({ where:{ id:String(form.get("conversationId") || ""), organizationId:member.organizationId },
    include:{ contact:true, phoneNumber:true } })
  if (!conversation) return NextResponse.json({ error:"Conversation not found." }, { status:404 })
  const phone = conversation.phoneNumber
  if (!phone) return NextResponse.json({ error:"File sending is available for WhatsApp chats." }, { status:400 })
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error:"Choose a file to send." }, { status:400 })
  const rule = attachmentRule(file.type)
  if (file.size > rule.maxBytes) return NextResponse.json({ error:`This ${rule.kind} is too large. WhatsApp allows up to ${rule.maxBytes / 1024 / 1024} MB.` }, { status:400 })
  const inboundAt = await lastInboundAt(conversation.id)
  if (!inboundAt || Date.now() - inboundAt.getTime() > WINDOW_MS)
    return NextResponse.json({ error:"The 24-hour reply window has closed, so files can't be sent. Send an approved template first." }, { status:409 })
  const accessToken = await getMetaAccessToken(member.organizationId)
  if (!accessToken) return NextResponse.json({ error:"Connect Meta before sending messages." }, { status:409 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const filename = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || `file.${rule.kind}`
  const mediaId = await uploadToWhatsApp(bytes, file.type, filename, phone.phoneNumberId, accessToken)
  const mediaUrl = await storeMedia(bytes, file.type)
  const result = await sendAndRecord({ accessToken, metaPhoneNumberId:phone.phoneNumberId, to:conversation.contact.phone,
    conversationId:conversation.id, senderUserId:member.userId },
    { type:rule.kind, [rule.kind]:{ id:mediaId, ...(caption && rule.kind !== "audio" ? { caption } : {}),
      ...(rule.kind === "document" ? { filename } : {}) } },
    caption, { source:"INBOX", mime:file.type, filename }, { mediaUrl })
  await prisma.conversation.update({ where:{ id:conversation.id }, data:{ flowState:Prisma.JsonNull,
    ...(conversation.assignedUserId ? {} : { assignedUserId:member.userId }) } })
  return NextResponse.json({ ok:true, id:result }, { status:201 })
}

const patchSchema = z.object({
  conversationId:z.string().min(1),
  status:z.enum(STATUSES).optional(),
  assignedUserId:z.string().min(1).nullable().optional(),
})

export async function PATCH(request: Request) {
  try {
    const member = await getMember()
    if (!member) return NextResponse.json({ error:"Unauthorized" }, { status:401 })
    const { organizationId } = member
    const input = patchSchema.parse(await request.json())
    const conversation = await prisma.conversation.findFirst({ where:{ id:input.conversationId, organizationId } })
    if (!conversation) return NextResponse.json({ error:"Conversation not found." }, { status:404 })
    if (input.assignedUserId) {
      const assignee = await prisma.membership.findFirst({ where:{ organizationId, userId:input.assignedUserId, status:"ACTIVE" } })
      if (!assignee) return NextResponse.json({ error:"That person is not a member of this workspace." }, { status:400 })
    }
    const updated = await prisma.conversation.update({ where:{ id:conversation.id }, data:{
      ...(input.status ? { status:input.status } : {}),
      ...(input.assignedUserId !== undefined ? { assignedUserId:input.assignedUserId } : {}),
    } })
    if (input.assignedUserId && input.assignedUserId !== conversation.assignedUserId)
      await emitEvent(organizationId, "conversation.assigned", { conversation_id:conversation.id, assigned_user_id:input.assignedUserId, by:member.userId })
    return NextResponse.json({ conversation:updated })
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "Could not update conversation." }, { status:400 })
  }
}
