import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

const pinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
})

// POST /api/whatsapp/accounts/[id]/pin
// Sets or changes the Two-Step Verification PIN on Meta Cloud API for a phone number.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const input = pinSchema.parse(body)

    const phone = await prisma.phoneNumber.findFirst({
      where: {
        OR: [{ id }, { phoneNumberId: id }],
        waba: { organizationId },
      },
    })

    if (!phone) {
      return NextResponse.json({ error: "Phone number not found." }, { status: 404 })
    }

    const conn = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    })

    if (!conn?.accessToken) {
      return NextResponse.json({ error: "No active Meta authorization token found." }, { status: 400 })
    }

    // Call Meta Cloud API to update 2FA PIN
    await metaGraph<{ success?: boolean }>(
      `${phone.phoneNumberId}`,
      conn.accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: input.pin,
        }),
      }
    )

    await prisma.phoneNumber.update({
      where: { id: phone.id },
      data: {
        verificationStatus: "VERIFIED",
        status: "CONNECTED",
      },
    })

    return NextResponse.json({
      ok: true,
      message: `✓ 6-Digit Two-Step Verification PIN updated successfully for ${phone.phoneNumber}!`,
    })
  } catch (error: any) {
    console.error("[WHATSAPP_UPDATE_PIN_ERROR]", error)
    return NextResponse.json(
      { error: error?.message || "Failed to update Two-Step Verification PIN on Meta." },
      { status: 500 }
    )
  }
}
