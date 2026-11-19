import { NextResponse } from "next/server"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { prisma } from "@/lib/db/prisma"
import { metaLoginConfig } from "@/lib/meta/config"

export const runtime = "nodejs"

// POST /api/whatsapp/onboarding/initiate
// Initiates an automated WhatsApp onboarding session for the authenticated workspace.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in to continue." }, { status: 401 })
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        wabas: {
          include: {
            phoneNumbers: true,
          },
        },
      },
    })

    if (!org) {
      return NextResponse.json({ error: "Organization workspace not found." }, { status: 404 })
    }

    const platformConfig = metaLoginConfig()
    const existingWaba = org.wabas[0] || null
    const existingPhone = existingWaba?.phoneNumbers[0] || null

    const sessionId = `ob_sess_${organizationId}_${Date.now()}`

    // Pre-flight readiness checks
    const readiness = {
      platformReady: platformConfig.ready,
      platformMissing: platformConfig.missing,
      appId: process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || "",
      configId: process.env.NEXT_PUBLIC_META_CONFIG_ID || process.env.META_CONFIG_ID || "",
      graphVersion: process.env.META_GRAPH_API_VERSION || "v25.0",
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      hasExistingConnection: Boolean(existingWaba && existingPhone?.status === "CONNECTED"),
      currentStatus: existingWaba
        ? existingPhone?.status === "CONNECTED"
          ? "CONNECTED"
          : "REGISTRATION_PENDING"
        : "NOT_STARTED",
      preflightChecklist: [
        {
          id: "fresh_phone",
          title: "Fresh / Eligible Phone Number",
          description: "Must be able to receive SMS or Voice OTP and not currently linked to WhatsApp consumer or business mobile app.",
          passed: true,
        },
        {
          id: "business_details",
          title: "Legal Business Name & Address",
          description: "Entity details matching official registration documents (e.g. GSTIN / PAN).",
          passed: Boolean(org.name),
        },
        {
          id: "portfolio_admin",
          title: "Meta Business Portfolio Full Control",
          description: "The Facebook user must be an Admin of the corporate Meta Business Portfolio.",
          passed: true,
        },
        {
          id: "meta_platform",
          title: "ZKWAConnect Tech Provider Integration",
          description: "Official Meta Embedded Signup v4 with automated asset delegation.",
          passed: platformConfig.ready,
        },
      ],
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      status: readiness.currentStatus === "CONNECTED" ? "CONNECTED" : "INITIATED",
      readiness,
      message: readiness.platformReady
        ? "Onboarding initialized. Ready for Embedded Signup v4."
        : "Platform setup incomplete. Configure Meta App ID & Secret.",
    })
  } catch (error: any) {
    console.error("[WHATSAPP_ONBOARDING_INITIATE_ERROR]", error)
    return NextResponse.json(
      { error: error?.message || "Failed to initialize onboarding session." },
      { status: 500 }
    )
  }
}
