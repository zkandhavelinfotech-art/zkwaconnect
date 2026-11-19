import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { recordLifecycleLog } from "@/lib/whatsapp/lifecycle"

export const runtime = "nodejs"

const roleSchema = z.object({
  role: z.enum(["MARKETING_BROADCAST", "TRANSACTIONAL_OTP", "CUSTOMER_SUPPORT", "GENERAL"]),
})

// POST /api/whatsapp/accounts/[id]/number-role
// Assigns an enterprise routing role to a connected WhatsApp number.
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
    const { role } = roleSchema.parse(body)

    const phone = await prisma.phoneNumber.findFirst({
      where: {
        OR: [{ id }, { phoneNumberId: id }],
        waba: { organizationId },
      },
    })

    if (!phone) {
      return NextResponse.json({ error: "Phone number not found." }, { status: 404 })
    }

    // Record role assignment as audit event
    await prisma.webhookEvent.create({
      data: {
        organizationId,
        eventType: "NUMBER_ROLE_ASSIGNED",
        payload: {
          phoneNumberId: phone.phoneNumberId,
          phoneNumber: phone.phoneNumber,
          assignedRole: role,
          assignedAt: new Date().toISOString(),
        },
      },
    })

    await recordLifecycleLog({
      organizationId,
      eventType: "NUMBER_ROLE_UPDATED",
      statusTo: "CONNECTED",
      sanitizedMessage: `Phone ${phone.phoneNumber} assigned role '${role.replace(/_/g, " ")}'.`,
    })

    return NextResponse.json({
      ok: true,
      phoneNumber: phone.phoneNumber,
      role,
      message: `Phone number routing role set to ${role.replace(/_/g, " ")}.`,
    })
  } catch (error: any) {
    console.error("[NUMBER_ROLE_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to update number role." }, { status: 500 })
  }
}
