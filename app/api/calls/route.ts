import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { activeCalls, answerCall, callPermission, endCall, rejectCall, requestCallPermission, startCall } from "@/lib/calls/calls"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Request failed" }, { status: errorStatus(error) })

// ?active=1 → ringing / live calls (polled every few seconds by the call widget); otherwise the call log.
export async function GET(request: Request) {
  try {
    const { organizationId, userId } = await requireMember()
    const url = new URL(request.url)
    if (url.searchParams.get("permission")) {
      const result = await callPermission(organizationId, url.searchParams.get("permission")!)
      return NextResponse.json({ status: result.status, until: result.until, canRequest: result.canRequest, canCall: result.canCall,
        contact: { id: result.contact.id, name: result.contact.name, phone: result.contact.phone } })
    }
    const active = await activeCalls(organizationId)
    const contactIds = [...new Set(active.map(call => call.contactId).filter(Boolean))] as string[]
    const contacts = contactIds.length ? await prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, phone: true } }) : []
    const withContact = active.map(call => ({ ...call, contact: contacts.find(contact => contact.id === call.contactId) || null,
      // Other agents' live calls are shown without their media details.
      ...(call.status === "ANSWERED" && call.answeredById !== userId && call.startedById !== userId ? { offerSdp: null, answerSdp: null } : {}) }))
    if (url.searchParams.get("active")) return NextResponse.json({ calls: withContact, userId })
    const log = await prisma.call.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, direction: true, status: true, durationSeconds: true, createdAt: true, answeredAt: true, endedAt: true, error: true, contactId: true, answeredById: true, startedById: true } })
    const logContacts = await prisma.contact.findMany({ where: { id: { in: [...new Set(log.map(call => call.contactId).filter(Boolean))] as string[] } }, select: { id: true, name: true, phone: true, callPermission: true, callPermissionUntil: true } })
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(log.flatMap(call => [call.answeredById, call.startedById]).filter(Boolean))] as string[] } }, select: { id: true, name: true } })
    return NextResponse.json({ calls: withContact, userId, log: log.map(call => ({ ...call, contact: logContacts.find(contact => contact.id === call.contactId) || null,
      agent: users.find(user => user.id === (call.answeredById || call.startedById))?.name || null })) })
  } catch (error) { return fail(error) }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), id: z.string().min(1), sdp: z.string().min(20).max(20000) }),
  z.object({ action: z.literal("reject"), id: z.string().min(1) }),
  z.object({ action: z.literal("end"), id: z.string().min(1) }),
  z.object({ action: z.literal("start"), contactId: z.string().min(1), sdp: z.string().min(20).max(20000) }),
  z.object({ action: z.literal("permission"), contactId: z.string().min(1) }),
])

export async function POST(request: Request) {
  try {
    const { organizationId, userId } = await requireMember()
    const input = schema.parse(await request.json())
    if (input.action === "answer") return NextResponse.json(await answerCall(organizationId, input.id, userId, input.sdp))
    if (input.action === "reject") return NextResponse.json(await rejectCall(organizationId, input.id))
    if (input.action === "end") return NextResponse.json(await endCall(organizationId, input.id))
    if (input.action === "start") return NextResponse.json(await startCall(organizationId, input.contactId, userId, input.sdp))
    return NextResponse.json(await requestCallPermission(organizationId, input.contactId, userId))
  } catch (error) { return fail(error) }
}
