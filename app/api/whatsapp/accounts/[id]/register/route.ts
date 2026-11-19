import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

const schema = z.object({
  pin: z.string().regex(/^\d{6}$/).default("123456"),
})

// POST /api/whatsapp/accounts/[id]/register
// Registers a phone number with Meta Cloud API using a 6-digit PIN.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized. Sign in to continue." }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const input = schema.parse(body)

    // Locate phone number or WABA
    const phone = await prisma.phoneNumber.findFirst({
      where: {
        OR: [{ id }, { phoneNumberId: id }],
        waba: { organizationId },
      },
      include: { waba: true },
    })

    if (!phone) {
      return NextResponse.json({ error: "Phone number not found in this workspace." }, { status: 404 })
    }

    const conn = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    })

    if (!conn?.accessToken) {
      return NextResponse.json(
        { error: "No active Meta authorization token found. Please reconnect Meta." },
        { status: 400 }
      )
    }

    // Call Meta Cloud API 2-step registration endpoint
    const res = await metaGraph<{ success?: boolean }>(
      `${phone.phoneNumberId}/register`,
      conn.accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin: input.pin,
        }),
      }
    )

    // Update phone status in database
    await prisma.phoneNumber.update({
      where: { id: phone.id },
      data: {
        status: "CONNECTED",
        verificationStatus: "VERIFIED",
      },
    })

    // Mark onboarding complete
    await prisma.onboarding.updateMany({
      where: { organizationId },
      data: {
        phoneRegistered: true,
        phoneVerified: true,
        currentStep: "COMPLETED",
        status: "COMPLETED",
        completedAt: new Date(),
      },
    })

    return NextResponse.json({
      ok: true,
      status: "CONNECTED",
      phoneNumberId: phone.phoneNumberId,
      phoneNumber: phone.phoneNumber,
      registered: true,
      message: `Phone number ${phone.phoneNumber} registered successfully on WhatsApp Cloud API!`,
    })
  } catch (error: any) {
    console.error("[WHATSAPP_PHONE_REGISTER_ERROR]", error)
    return NextResponse.json(
      { error: error?.message || "Registration failed. Verify 6-digit PIN and OTP status." },
      { status: 500 }
    )
  }
}
