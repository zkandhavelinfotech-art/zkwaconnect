import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken, getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

const requestSchema = z.object({
  phoneNumberId: z.string().regex(/^\d{5,30}$/),
  codeMethod: z.enum(["SMS", "VOICE"]),
})

export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error: "Connect your Meta account first." }, { status: 409 })
    const input = requestSchema.parse(await request.json())
    const waba = await prisma.waba.findFirst({ where: { organizationId, status: "CONNECTED" } })
    if (!waba) return NextResponse.json({ error: "Select a WhatsApp Business Account first." }, { status: 409 })

    const phones = await metaGraph<{ data: { id: string; display_phone_number: string; verified_name?: string }[] }>(
      `${waba.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`, accessToken)
    const phone = phones.data.find(item => item.id === input.phoneNumberId)
    if (!phone) return NextResponse.json({ error: "That phone number is not part of the selected WABA." }, { status: 404 })
    const existing = await prisma.phoneNumber.findUnique({ where: { phoneNumberId: phone.id } })
    if (existing && existing.wabaId !== waba.id)
      return NextResponse.json({ error: "This phone number is linked to another workspace." }, { status: 409 })

    const body = new URLSearchParams({ code_method: input.codeMethod, language: "en_US" })
    await metaGraph(`${phone.id}/request_code`, accessToken, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    })
    await prisma.phoneNumber.upsert({
      where: { phoneNumberId: phone.id },
      create: { wabaId: waba.id, phoneNumberId: phone.id, phoneNumber: phone.display_phone_number, displayName: phone.verified_name, status: "PENDING", verificationStatus: "CODE_SENT" },
      update: { phoneNumber: phone.display_phone_number, displayName: phone.verified_name, status: "PENDING", verificationStatus: "CODE_SENT" },
    })
    await prisma.onboarding.upsert({
      where: { organizationId },
      create: { organizationId, metaConnected: true, wabaCreated: true, currentStep: "PHONE_VERIFICATION_PENDING", status: "PHONE_VERIFICATION_PENDING" },
      update: { currentStep: "PHONE_VERIFICATION_PENDING", status: "PHONE_VERIFICATION_PENDING" },
    })

    return NextResponse.json({ ok: true, message: `Verification code sent by ${input.codeMethod.toLowerCase()}.` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send verification code." }, { status: 400 })
  }
}