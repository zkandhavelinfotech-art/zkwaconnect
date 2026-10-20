import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { emitEvent } from "@/lib/developer/webhooks"
import { sendAndRecord } from "@/lib/whatsapp/send"

// STOP / START keywords: customers can unsubscribe from (and re-subscribe to) marketing messages by replying.
export const DEFAULT_OPT_OUT = ["stop", "unsubscribe", "stop promotions", "stop all", "opt out", "optout", "cancel subscription"]
export const DEFAULT_OPT_IN = ["start", "subscribe", "unstop"]
export const DEFAULT_OPT_OUT_MESSAGE = "You've been unsubscribed and won't receive promotional messages from us. Reply START anytime to subscribe again."
export const DEFAULT_OPT_IN_MESSAGE = "Welcome back! 🎉 You're subscribed to our updates again. Reply STOP anytime to unsubscribe."

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim()
const list = (value: Prisma.JsonValue | undefined, fallback: string[]) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map(normalize).filter(Boolean) : fallback

export async function consentSettings(organizationId: string) {
  const row = await prisma.inboxSettings.findUnique({ where: { organizationId } })
  return {
    enabled: row?.optOutEnabled ?? true,
    optOutKeywords: list(row?.optOutKeywords, DEFAULT_OPT_OUT), optInKeywords: list(row?.optInKeywords, DEFAULT_OPT_IN),
    optOutMessage: row?.optOutMessage ?? DEFAULT_OPT_OUT_MESSAGE, optInMessage: row?.optInMessage ?? DEFAULT_OPT_IN_MESSAGE,
  }
}

// Returns "opted_out" / "opted_in" when the message was a consent keyword (and was handled), otherwise null.
export async function handleConsentKeyword(input: { organizationId: string; contactId: string; conversationId: string; text: string
  to: string; metaPhoneNumberId: string; getAccessToken: () => Promise<string> }) {
  const text = normalize(input.text)
  if (!text || text.length > 40) return null
  const settings = await consentSettings(input.organizationId)
  if (!settings.enabled) return null
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: input.contactId } })
  let result: "opted_out" | "opted_in" | null = null
  if (settings.optOutKeywords.includes(text)) {
    await prisma.contact.update({ where: { id: contact.id }, data: { optedIn: false, optedOutAt: new Date() } })
    await prisma.conversation.update({ where: { id: input.conversationId }, data: { flowState: Prisma.JsonNull } })
    // Anything still queued for this person in a broadcast is skipped.
    await prisma.campaignRecipient.updateMany({ where: { contactId: contact.id, status: "QUEUED" },
      data: { status: "SKIPPED", errorCode: "SKIPPED", errorMessage: "Customer opted out (STOP) before sending.", failedAt: new Date() } })
    result = "opted_out"
  } else if (settings.optInKeywords.includes(text) && (contact.optedOutAt || !contact.optedIn)) {
    // START only re-subscribes people who aren't subscribed (so "start" can still be a normal keyword for others).
    await prisma.contact.update({ where: { id: contact.id }, data: { optedIn: true, optedOutAt: null } })
    result = "opted_in"
  }
  if (!result) return null
  await emitEvent(input.organizationId, result === "opted_out" ? "contact.opted_out" : "contact.opted_in", { contact: { id: contact.id, phone: contact.phone, name: contact.name }, keyword: text })
  const message = result === "opted_out" ? settings.optOutMessage : settings.optInMessage
  if (message.trim()) await sendAndRecord({ accessToken: await input.getAccessToken(), metaPhoneNumberId: input.metaPhoneNumberId, to: input.to, conversationId: input.conversationId },
    { type: "text", text: { preview_url: false, body: message } }, message, { source: result === "opted_out" ? "OPT_OUT" : "OPT_IN" }).catch(error => console.error("[consent] confirmation failed", error))
  return result
}
