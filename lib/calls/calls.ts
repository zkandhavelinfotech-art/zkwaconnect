import { prisma } from "@/lib/db/prisma"
import { metaGraph } from "@/lib/meta/graph"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { serviceWindowOpen } from "@/lib/billing/messaging"
import { findOrCreateConversation } from "@/lib/whatsapp/conversation"
import { sendAndRecord } from "@/lib/whatsapp/send"
import { notifyWorkspace } from "@/lib/payments/notify"

// WhatsApp Calling (Cloud API). Media flows browser ⇄ Meta over WebRTC; this server only relays signalling:
//  • incoming: "calls" webhook (connect + SDP offer) → agent's browser answers → pre_accept + accept with its SDP answer
//  • outgoing: browser's SDP offer → POST /calls action=connect → "calls" webhook (connect + SDP answer) → browser
// Calling a customer needs their permission (call_permission_request, 7 days) or a permanent grant.

const RING_SECONDS = 60
type Phone = { id: string; phoneNumberId: string; waba: { organizationId: string } }
type CallEvent = { id?: string; from?: string; to?: string; event?: string; direction?: string; timestamp?: string; status?: string; duration?: number
  session?: { sdp_type?: string; sdp?: string }; errors?: { code?: number; message?: string }[] }

async function phoneAndToken(organizationId: string, phoneNumberRowId: string) {
  const phone = await prisma.phoneNumber.findFirst({ where: { id: phoneNumberRowId, waba: { organizationId } } })
  const token = await getMetaAccessToken(organizationId)
  if (!phone || !token) throw new Error("Connect a WhatsApp number first.")
  return { phone, token }
}
const callsApi = (phoneNumberId: string, token: string, body: Record<string, unknown>) =>
  metaGraph<{ success?: boolean; calls?: { id: string }[] }>(`${phoneNumberId}/calls`, token, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }) })

async function contactFor(organizationId: string, waId: string, name?: string) {
  const phone = waId.replace(/\D/g, "")
  return prisma.contact.upsert({ where: { organizationId_phone: { organizationId, phone } }, update: {}, create: { organizationId, phone, name: name || null, source: "WHATSAPP_CALL" } })
}

// Webhook value with field "calls".
export async function handleCallsWebhook(phone: Phone, value: { calls?: CallEvent[]; contacts?: { profile?: { name?: string }; wa_id?: string }[] }) {
  const organizationId = phone.waba.organizationId
  for (const event of value.calls || []) {
    if (!event.id) continue
    if (event.event === "connect" && event.direction === "USER_INITIATED") {
      if (!event.from) continue
      const contact = await contactFor(organizationId, event.from, value.contacts?.find(item => item.wa_id === event.from)?.profile?.name)
      await prisma.call.upsert({ where: { metaCallId: event.id }, update: {},
        create: { organizationId, phoneNumberId: phone.id, contactId: contact.id, metaCallId: event.id, direction: "INBOUND", status: "RINGING", offerSdp: event.session?.sdp || null } })
      // Calling us grants call-back permission automatically when callback_permission_status is enabled.
      await notifyWorkspace(organizationId, "CALL_INCOMING", `📞 Incoming WhatsApp call`, `${contact.name || `+${contact.phone}`} is calling. Answer in ZKWAConnect.`, "/app/calls")
    } else if (event.event === "connect" && event.direction === "BUSINESS_INITIATED") {
      await prisma.call.updateMany({ where: { metaCallId: event.id, organizationId }, data: { answerSdp: event.session?.sdp || null } })
    } else if (event.event === "terminate") {
      const call = await prisma.call.findUnique({ where: { metaCallId: event.id } })
      if (!call) continue
      const answered = Boolean(call.answeredAt || event.duration)
      const status = event.status === "FAILED" ? "FAILED" : answered ? "ENDED" : call.direction === "INBOUND" ? "MISSED" : call.status === "REJECTED" ? "REJECTED" : "NO_ANSWER"
      await prisma.call.update({ where: { id: call.id }, data: { status, endedAt: new Date(), durationSeconds: event.duration ?? (call.answeredAt ? Math.round((Date.now() - call.answeredAt.getTime()) / 1000) : null),
        error: event.errors?.[0]?.message || null, offerSdp: null, answerSdp: null } })
      if (status === "MISSED") {
        const contact = call.contactId ? await prisma.contact.findUnique({ where: { id: call.contactId } }) : null
        await notifyWorkspace(organizationId, "CALL_MISSED", "Missed WhatsApp call", `${contact?.name || (contact ? `+${contact.phone}` : "A customer")} called and nobody answered. Call back from Calls.`, "/app/calls")
      }
      if (call.contactId) await logInChat(organizationId, phone.id, call.contactId, `📞 ${call.direction === "INBOUND" ? "Incoming" : "Outgoing"} call · ${status === "ENDED" ? `${event.duration ?? 0}s` : status.toLowerCase().replace("_", " ")}`)
    }
  }
}

// statuses[] with type "call" (outgoing calls: RINGING / ACCEPTED / REJECTED).
export async function handleCallStatus(organizationId: string, status: { id?: string; status?: string }) {
  if (!status.id || !status.status) return
  const next = status.status.toUpperCase()
  await prisma.call.updateMany({ where: { metaCallId: status.id, organizationId, status: { in: ["RINGING", "ANSWERED"] } },
    data: next === "ACCEPTED" ? { status: "ANSWERED", answeredAt: new Date() } : next === "REJECTED" ? { status: "REJECTED" } : { status: "RINGING" } })
}

// interactive.call_permission_reply from the customer.
export async function handlePermissionReply(organizationId: string, from: string, reply: { response?: string; is_permanent?: boolean; expiration_timestamp?: string }) {
  const phone = from.replace(/\D/g, "")
  const accepted = reply.response === "accept"
  await prisma.contact.updateMany({ where: { organizationId, phone }, data: {
    callPermission: accepted ? (reply.is_permanent ? "permanent" : "temporary") : "rejected",
    callPermissionUntil: accepted && !reply.is_permanent && reply.expiration_timestamp ? new Date(Number(reply.expiration_timestamp) * 1000) : null } })
  if (accepted) await notifyWorkspace(organizationId, "CALL_PERMISSION", "Customer allowed calls", `+${phone} accepted your call request${reply.is_permanent ? "" : " for 7 days"}. You can call them from Calls.`, "/app/calls")
}

async function logInChat(organizationId: string, phoneNumberRowId: string, contactId: string, text: string) {
  const conversation = await findOrCreateConversation({ organizationId, phoneNumberId: phoneNumberRowId, contactId, reopen: false })
  await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", type: "CALL", content: text, status: "RECEIVED", sentAt: new Date(), metadata: { source: "CALL" } } })
}

// ── Agent actions ──────────────────────────────────────────────────────────

export async function answerCall(organizationId: string, callId: string, userId: string, sdp: string) {
  // First agent to answer gets the call.
  const claimed = await prisma.call.updateMany({ where: { id: callId, organizationId, direction: "INBOUND", status: "RINGING", answeredById: null }, data: { answeredById: userId } })
  if (!claimed.count) throw new Error("This call was already answered or has ended.")
  const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } })
  const { phone, token } = await phoneAndToken(organizationId, call.phoneNumberId)
  try {
    const session = { sdp_type: "answer", sdp }
    await callsApi(phone.phoneNumberId, token, { call_id: call.metaCallId, action: "pre_accept", session })
    await callsApi(phone.phoneNumberId, token, { call_id: call.metaCallId, action: "accept", session, biz_opaque_callback_data: call.id })
  } catch (error) {
    await prisma.call.update({ where: { id: call.id }, data: { answeredById: null } })
    throw error
  }
  await prisma.call.update({ where: { id: call.id }, data: { status: "ANSWERED", answeredAt: new Date(), answerSdp: sdp } })
  return { ok: true }
}

export async function rejectCall(organizationId: string, callId: string) {
  const call = await prisma.call.findFirst({ where: { id: callId, organizationId, status: "RINGING", direction: "INBOUND" } })
  if (!call) return { ok: true }
  const { phone, token } = await phoneAndToken(organizationId, call.phoneNumberId)
  await callsApi(phone.phoneNumberId, token, { call_id: call.metaCallId, action: "reject" }).catch(() => null)
  await prisma.call.update({ where: { id: call.id }, data: { status: "REJECTED", endedAt: new Date() } })
  return { ok: true }
}

export async function endCall(organizationId: string, callId: string) {
  const call = await prisma.call.findFirst({ where: { id: callId, organizationId, status: { in: ["RINGING", "ANSWERED"] } } })
  if (!call) return { ok: true }
  const { phone, token } = await phoneAndToken(organizationId, call.phoneNumberId)
  // Terminate even after the media stops, so Meta prices the call correctly.
  await callsApi(phone.phoneNumberId, token, { call_id: call.metaCallId, action: "terminate" }).catch(() => null)
  await prisma.call.update({ where: { id: call.id }, data: { status: call.answeredAt ? "ENDED" : "CANCELLED", endedAt: new Date(),
    durationSeconds: call.answeredAt ? Math.round((Date.now() - call.answeredAt.getTime()) / 1000) : null } })
  return { ok: true }
}

// Meta's live permission status for a contact (and whether a request / call is allowed right now).
export async function callPermission(organizationId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId } })
  if (!contact || contact.phone.startsWith("ig:")) throw new Error("This contact has no WhatsApp number.")
  const phone = await prisma.phoneNumber.findFirst({ where: { waba: { organizationId }, status: "CONNECTED", callingEnabled: true }, orderBy: { createdAt: "asc" } })
  if (!phone) throw new Error("Turn on calling for a WhatsApp number under Calls → Settings first.")
  const token = await getMetaAccessToken(organizationId)
  if (!token) throw new Error("Connect Meta first.")
  const result = await metaGraph<{ permission?: { status?: string; expiration_time?: number }; actions?: { action_name: string; can_perform_action: boolean; limits?: { time_period: string; max_allowed: number; current_usage: number; limit_expiration_time?: number }[] }[] }>(
    `${phone.phoneNumberId}/call_permissions?user_wa_id=${contact.phone}`, token)
  const status = result.permission?.status || "no_permission"
  await prisma.contact.update({ where: { id: contact.id }, data: { callPermission: status === "no_permission" ? null : status,
    callPermissionUntil: result.permission?.expiration_time ? new Date(result.permission.expiration_time * 1000) : null } })
  const can = (name: string) => result.actions?.find(action => action.action_name === name)?.can_perform_action ?? false
  return { contact, phone, token, status, until: result.permission?.expiration_time ? new Date(result.permission.expiration_time * 1000) : null,
    canRequest: can("send_call_permission_request"), canCall: can("start_call") }
}

export async function requestCallPermission(organizationId: string, contactId: string, userId: string) {
  const { contact, phone, token, canRequest, status } = await callPermission(organizationId, contactId)
  if (status === "permanent" || status === "temporary") return { ok: true, message: "This customer already allows calls." }
  if (!canRequest) throw new Error("WhatsApp allows 1 call request per day and 2 per week to the same customer. Try again later.")
  const conversation = await findOrCreateConversation({ organizationId, phoneNumberId: phone.id, contactId: contact.id, reopen: false })
  if (!(await serviceWindowOpen(conversation.id))) throw new Error("Call requests can only be sent within 24 hours of the customer's last message.")
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } })
  await sendAndRecord({ accessToken: token, metaPhoneNumberId: phone.phoneNumberId, to: contact.phone, conversationId: conversation.id, senderUserId: userId },
    { type: "interactive", interactive: { type: "call_permission_request", action: { name: "call_permission_request" }, body: { text: `${org.name} would like to call you on WhatsApp to help with your request.` } } },
    "📞 Asked permission to call", { source: "CALL_PERMISSION_REQUEST" })
  return { ok: true, message: "Call request sent. You'll be notified when the customer accepts." }
}

export async function startCall(organizationId: string, contactId: string, userId: string, sdp: string) {
  const { contact, phone, token, canCall, status } = await callPermission(organizationId, contactId)
  if (status !== "permanent" && status !== "temporary") throw new Error("This customer hasn't allowed calls yet. Send a call request first.")
  if (!canCall) throw new Error("WhatsApp's call limit for this customer is reached for today. Try again later.")
  const result = await callsApi(phone.phoneNumberId, token, { to: contact.phone, action: "connect", session: { sdp_type: "offer", sdp } })
  const metaCallId = result.calls?.[0]?.id
  if (!metaCallId) throw new Error("WhatsApp did not start the call.")
  const call = await prisma.call.create({ data: { organizationId, phoneNumberId: phone.id, contactId: contact.id, metaCallId, direction: "OUTBOUND", status: "RINGING", startedById: userId } })
  return { id: call.id }
}

// Calls that still need attention: ringing (for everyone) and the agent's own live call.
export async function activeCalls(organizationId: string) {
  // Ringing calls that Meta never terminated (webhook lost) are dropped after the ring window.
  await prisma.call.updateMany({ where: { organizationId, status: "RINGING", direction: "INBOUND", createdAt: { lt: new Date(Date.now() - RING_SECONDS * 1000 - 15_000) } }, data: { status: "MISSED", endedAt: new Date(), offerSdp: null } })
  return prisma.call.findMany({ where: { organizationId, status: { in: ["RINGING", "ANSWERED"] }, createdAt: { gt: new Date(Date.now() - 4 * 3600_000) } },
    select: { id: true, direction: true, status: true, offerSdp: true, answerSdp: true, answeredById: true, startedById: true, answeredAt: true, createdAt: true,
      contactId: true }, orderBy: { createdAt: "desc" } })
}

// Turn calling on/off for a number (Meta settings API). Customers then see the call button in the chat.
export async function setCalling(organizationId: string, phoneNumberRowId: string, enabled: boolean) {
  const { phone, token } = await phoneAndToken(organizationId, phoneNumberRowId)
  await metaGraph(`${phone.phoneNumberId}/settings`, token, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calling: { status: enabled ? "ENABLED" : "DISABLED", call_icon_visibility: "DEFAULT", callback_permission_status: "ENABLED" } }) })
  await prisma.phoneNumber.update({ where: { id: phone.id }, data: { callingEnabled: enabled } })
}
