import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { apiError, apiHandler } from "@/lib/developer/api"

export const runtime = "nodejs"

// GET /api/v1/messages/{id} — status of a message (our id or the WhatsApp message id "wamid…").
export const GET = apiHandler<{ id: string }>(async (_request, { organizationId }, { id }) => {
  const message = await prisma.message.findFirst({
    where: { OR: [{ id }, { externalMessageId: id }], conversation: { organizationId }, direction: { in: ["INBOUND", "OUTBOUND"] } },
    select: { id: true, externalMessageId: true, direction: true, type: true, content: true, status: true, sentAt: true, deliveredAt: true, readAt: true, createdAt: true,
      conversation: { select: { id: true, contact: { select: { id: true, phone: true, name: true } } } } },
  })
  if (!message) return apiError(404, "not_found", "No message with that id in this workspace.")
  return NextResponse.json({
    id: message.id, whatsapp_message_id: message.externalMessageId, direction: message.direction.toLowerCase(), type: message.type.toLowerCase(),
    text: message.content, status: (message.status || "").toLowerCase(), sent_at: message.sentAt, delivered_at: message.deliveredAt, read_at: message.readAt,
    created_at: message.createdAt, conversation_id: message.conversation.id, contact: message.conversation.contact,
  })
})
