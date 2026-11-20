import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"

export const runtime = "nodejs"

const schema = z.object({
  phoneNumberId: z.string().min(1),
})

// POST /api/whatsapp/accounts/default-phone
// Sets the designated phone number as the active workspace default sender.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 })
    }

    const body = await request.json()
    const { phoneNumberId } = schema.parse(body)

    // Verify phone belongs to this organization's WABA
    const phone = await prisma.phoneNumber.findFirst({
      where: {
        OR: [{ id: phoneNumberId }, { phoneNumberId }],
        waba: { organizationId },
      },
      include: { waba: true },
    })

    if (!phone) {
      return NextResponse.json(
        { error: "Phone number not found in this workspace." },
        { status: 404 }
      )
    }

    const now = new Date()

    // Touch this phone number and its parent WABA to make it top priority in queries
    await prisma.$transaction([
      prisma.phoneNumber.update({
        where: { id: phone.id },
        data: { updatedAt: now },
      }),
      prisma.waba.update({
        where: { id: phone.wabaId },
        data: { updatedAt: now },
      }),
    ])

    return NextResponse.json({
      ok: true,
      phoneNumberId: phone.phoneNumberId,
      displayPhoneNumber: phone.phoneNumber,
      message: `Phone number ${phone.phoneNumber} is now the default workspace sender for Live Chat and Campaigns.`,
    })
  } catch (error: any) {
    console.error("[SET_DEFAULT_PHONE_ERROR]", error)
    return NextResponse.json(
      { error: error?.message || "Failed to set default phone number." },
      { status: 400 }
    )
  }
}
