import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

// GET /api/whatsapp/accounts/[id]/status
// Retrieves real-time connectivity status, health, and quality rating for a WABA / Phone Number.
export async function GET(
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
      return NextResponse.json({ error: "WhatsApp Account not found." }, { status: 404 })
    }

    const conn = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    })

    let liveMetaStatus: any = null
    const primaryPhone = waba.phoneNumbers[0] || null

    if (conn?.accessToken) {
      try {
        if (primaryPhone) {
          liveMetaStatus = await metaGraph<any>(
            `${primaryPhone.phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`,
            conn.accessToken
          )

          if (liveMetaStatus?.quality_rating && liveMetaStatus.quality_rating !== primaryPhone.qualityRating) {
            await prisma.phoneNumber.update({
              where: { id: primaryPhone.id },
              data: {
                qualityRating: liveMetaStatus.quality_rating,
                displayName: liveMetaStatus.verified_name || primaryPhone.displayName,
              },
            })
          }
        }
      } catch (err: any) {
        liveMetaStatus = { error: err.message }
      }
    }

    const isConnected = waba.status === "CONNECTED" && primaryPhone?.status === "CONNECTED"

    return NextResponse.json({
      ok: true,
      status: isConnected ? "CONNECTED" : "REGISTRATION_PENDING",
      waba: {
        id: waba.id,
        wabaId: waba.wabaId,
        name: waba.name,
        status: waba.status,
      },
      phone: primaryPhone
        ? {
            id: primaryPhone.id,
            phoneNumberId: primaryPhone.phoneNumberId,
            phoneNumber: primaryPhone.phoneNumber,
            displayName: primaryPhone.displayName,
            status: primaryPhone.status,
            verificationStatus: primaryPhone.verificationStatus,
            qualityRating: primaryPhone.qualityRating,
          }
        : null,
      liveMetaStatus,
    })
  } catch (error: any) {
    console.error("[WHATSAPP_STATUS_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Could not retrieve status." }, { status: 500 })
  }
}
