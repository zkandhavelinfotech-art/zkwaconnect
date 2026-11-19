import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"

export const runtime = "nodejs"

// POST /api/whatsapp/accounts/[id]/disconnect
// Safely parks and disconnects a WABA from the workspace without destroying historic logs.
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

    const waba = await prisma.waba.findFirst({
      where: {
        OR: [{ id }, { wabaId: id }],
        organizationId,
      },
      include: {
        phoneNumbers: true,
      },
    })

    if (!waba) {
      return NextResponse.json({ error: "WhatsApp account not found." }, { status: 404 })
    }

    // Safely park statuses
    await prisma.$transaction([
      prisma.waba.update({
        where: { id: waba.id },
        data: { status: "DISCONNECTED" },
      }),
      prisma.phoneNumber.updateMany({
        where: { wabaId: waba.id },
        data: { status: "DISCONNECTED" },
      }),
      prisma.onboarding.updateMany({
        where: { organizationId },
        data: {
          phoneRegistered: false,
          currentStep: "NOT_STARTED",
          status: "NOT_STARTED",
          completedAt: null,
        },
      }),
    ])

    return NextResponse.json({
      ok: true,
      status: "DISCONNECTED",
      message: `WhatsApp account ${waba.name} has been disconnected safely. You can reconnect at any time.`,
    })
  } catch (error: any) {
    console.error("[WHATSAPP_DISCONNECT_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to disconnect account." }, { status: 500 })
  }
}
