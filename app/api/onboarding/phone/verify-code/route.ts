import { NextResponse } from "next/server"
import { assertNumberAvailable } from "@/lib/billing/limits"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken, getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

// Phone verificationStatus: CODE_SENT → CODE_VERIFIED (ownership proven) → VERIFIED (registered on the Cloud API).
const verifySchema = z.object({
  phoneNumberId: z.string().regex(/^\d{5,30}$/),
  code: z.string().regex(/^\d{6}$/).optional().or(z.literal("")),
  pin: z.string().regex(/^\d{6}$/),
})

type MetaPhone = { id: string; display_phone_number: string; verified_name?: string; code_verification_status?: string }

export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error: "Connect your Meta account first." }, { status: 409 })
    const input = verifySchema.parse(await request.json())
    const waba = await prisma.waba.findFirst({ where: { organizationId, status: "CONNECTED" } })
    if (!waba) return NextResponse.json({ error: "Select a WhatsApp Business Account first." }, { status: 409 })

    let phone = await prisma.phoneNumber.findFirst({ where: { phoneNumberId: input.phoneNumberId, wabaId: waba.id } })
    if (!phone) {
      // A number Meta already verified (e.g. in Embedded Signup or WhatsApp Manager) can register without a new code.
      const phones = await metaGraph<{ data: MetaPhone[] }>(`${waba.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status&limit=100`, accessToken)
      const metaPhone = phones.data.find(item => item.id === input.phoneNumberId)
      if (!metaPhone) return NextResponse.json({ error: "That phone number is not part of the selected WhatsApp account." }, { status: 404 })
      if (metaPhone.code_verification_status !== "VERIFIED") return NextResponse.json({ error: "Request a verification code for this number first." }, { status: 409 })
      const elsewhere = await prisma.phoneNumber.findUnique({ where: { phoneNumberId: metaPhone.id } })
      if (elsewhere) return NextResponse.json({ error: "This phone number is linked to another workspace." }, { status: 409 })
      phone = await prisma.phoneNumber.create({ data: { wabaId: waba.id, phoneNumberId: metaPhone.id, phoneNumber: metaPhone.display_phone_number,
        displayName: metaPhone.verified_name, status: "PENDING", verificationStatus: "CODE_VERIFIED" } })
    }

    if (phone.status !== "CONNECTED") await assertNumberAvailable(organizationId)
    const ownershipProven = phone.verificationStatus === "CODE_VERIFIED" || phone.verificationStatus === "VERIFIED"
    if (!ownershipProven) {
      if (!input.code) return NextResponse.json({ error: "Enter the 6-digit code Meta sent you." }, { status: 400 })
      await metaGraph(`${phone.phoneNumberId}/verify_code`, accessToken, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: input.code }),
      })
      await prisma.phoneNumber.update({ where: { id: phone.id }, data: { verificationStatus: "CODE_VERIFIED" } })
    }
    await metaGraph(`${phone.phoneNumberId}/register`, accessToken, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ messaging_product: "whatsapp", pin: input.pin }),
    })

    await prisma.$transaction([
      prisma.phoneNumber.update({
        where: { id: phone.id },
        data: { status: "CONNECTED", verificationStatus: "VERIFIED" },
      }),
      prisma.onboarding.upsert({
        where: { organizationId },
        create: { organizationId, metaConnected: true, wabaCreated: true, phoneRegistered: true,
          phoneVerified: true, currentStep: "COMPLETED", status: "COMPLETED", completedAt: new Date() },
        update: { phoneRegistered: true, phoneVerified: true, currentStep: "COMPLETED", status: "COMPLETED", completedAt: new Date() },
      }),
    ])

    return NextResponse.json({ ok: true, redirect: "/onboarding/complete" })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify and register phone number." }, { status: 400 })
  }
}
