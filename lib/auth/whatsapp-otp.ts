import { prisma } from "@/lib/db/prisma"
import { metaGraph } from "@/lib/meta/graph"
import { getMetaAccessToken } from "@/lib/onboarding/context"

// Verification codes sent from the platform's own WhatsApp number (one of the company's connected numbers),
// using an approved AUTHENTICATION template such as "{{1}} is your verification code." with a Copy code button.

export type PlatformWhatsApp = { phoneNumberId: string; templateName: string; language: string }
const KEY = "platform_whatsapp"

export async function platformWhatsApp(): Promise<PlatformWhatsApp | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } })
  const value = row?.value as Partial<PlatformWhatsApp> | undefined
  return value?.phoneNumberId && value.templateName ? { phoneNumberId: value.phoneNumberId, templateName: value.templateName, language: value.language || "en" } : null
}

export async function savePlatformWhatsApp(value: PlatformWhatsApp | null) {
  if (!value) { await prisma.platformSetting.deleteMany({ where: { key: KEY } }); return }
  await prisma.platformSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
}

// Digits only with country code; Indian 10-digit numbers get 91.
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "")
  return digits.length === 10 ? `91${digits}` : digits
}

export async function sendWhatsAppCode(phone: string, code: string) {
  const config = await platformWhatsApp()
  if (!config) throw new Error("WhatsApp codes are not set up.")
  const number = await prisma.phoneNumber.findUnique({ where: { id: config.phoneNumberId }, include: { waba: { select: { organizationId: true } } } })
  if (!number || number.status !== "CONNECTED") throw new Error("The platform WhatsApp number is not connected.")
  const token = await getMetaAccessToken(number.waba.organizationId)
  if (!token) throw new Error("The platform WhatsApp number has no Meta access token.")
  // Authentication templates with a Copy code / one-tap button need the code as the button parameter too.
  const template = await prisma.template.findFirst({ where: { organizationId: number.waba.organizationId, name: config.templateName }, select: { components: true } })
  const hasButton = JSON.stringify(template?.components || []).toUpperCase().includes("BUTTONS") || !template
  await metaGraph(`${number.phoneNumberId}/messages`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    messaging_product: "whatsapp", recipient_type: "individual", to: normalizePhone(phone), type: "template",
    template: { name: config.templateName, language: { code: config.language }, components: [
      { type: "body", parameters: [{ type: "text", text: code }] },
      ...(hasButton ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }] : []),
    ] },
  }) })
}
