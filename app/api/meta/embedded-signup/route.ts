import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { metaLoginConfig } from "@/lib/meta/config"
import { exchangeCode, saveMetaConnection } from "@/lib/meta/connection"
import { subscribeWaba } from "@/lib/meta/waba"
import { activateWaba } from "@/lib/onboarding/activate-waba"

export const runtime = "nodejs"

const schema = z.object({
  code: z.string().min(10).max(2000),
  wabaId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
  phoneNumberId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
})

type MetaWaba = { id: string; name: string; currency?: string; timezone_id?: string; owner_business_info?: { id?: string; name?: string } }
type MetaPhone = { id: string; display_phone_number: string; verified_name?: string; code_verification_status?: string }

// Completes Meta's Embedded Signup: the popup returns an auth code plus the WABA and phone the business chose.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    if (!metaLoginConfig().ready) return NextResponse.json({ error: "Facebook login isn't set up on this server yet." }, { status: 409 })
    const input = schema.parse(await request.json())

    const token = await exchangeCode(input.code)
    await saveMetaConnection(organizationId, token)

    // Meta's popup didn't report a finished WABA (e.g. older flow) — let the user pick from the list.
    if (!input.wabaId) return NextResponse.json({ ok: true, redirect: "/onboarding/waba-setup", message: "Facebook connected. Choose your WhatsApp account." })

    const waba = await metaGraph<MetaWaba>(`${input.wabaId}?fields=id,name,currency,timezone_id,owner_business_info`, token.accessToken)
    const existing = await prisma.waba.findUnique({ where: { wabaId: waba.id } })
    if (existing && existing.organizationId !== organizationId)
      return NextResponse.json({ error: "This WhatsApp account is already linked to another ZKWAConnect workspace." }, { status: 409 })
    await activateWaba({ organizationId, businessId: waba.owner_business_info?.id || null, waba })

    const warnings: string[] = []
    await subscribeWaba(waba.id, token.accessToken)
      .catch(error => warnings.push(`Webhook subscription failed (${error instanceof Error ? error.message : "error"}). Retry from Settings → WhatsApp.`))

    let phone: MetaPhone | null = null
    if (input.phoneNumberId) {
      phone = await metaGraph<MetaPhone>(`${input.phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status`, token.accessToken)
        .catch(error => { warnings.push(`Couldn't read the phone number (${error instanceof Error ? error.message : "error"}).`); return null })
      if (phone) {
        const saved = await prisma.waba.findUniqueOrThrow({ where: { wabaId: waba.id } })
        const current = await prisma.phoneNumber.findUnique({ where: { phoneNumberId: phone.id } })
        if (current && current.wabaId !== saved.id) {
          warnings.push("That phone number is linked to another workspace.")
        } else if (current?.status !== "CONNECTED") {
          // CODE_VERIFIED: Meta verified ownership in the popup; it still needs registering with a PIN.
          const verificationStatus = phone.code_verification_status === "VERIFIED" ? "CODE_VERIFIED" : null
          await prisma.phoneNumber.upsert({
            where: { phoneNumberId: phone.id },
            create: { wabaId: saved.id, phoneNumberId: phone.id, phoneNumber: phone.display_phone_number, displayName: phone.verified_name,
              status: "PENDING", verificationStatus },
            update: { phoneNumber: phone.display_phone_number, displayName: phone.verified_name, status: "PENDING", verificationStatus },
          })
        }
      }
    }

    return NextResponse.json({
      ok: true, warnings, redirect: "/onboarding/phone-registration",
      waba: { id: waba.id, name: waba.name, business: waba.owner_business_info?.name || null },
      phone: phone ? { id: phone.id, display: phone.display_phone_number, name: phone.verified_name || null } : null,
      message: `Connected ${waba.name}${phone ? ` with ${phone.display_phone_number}` : ""}. Choose a PIN to activate the number.`,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Embedded Signup could not be completed." }, { status: 400 })
  }
}
