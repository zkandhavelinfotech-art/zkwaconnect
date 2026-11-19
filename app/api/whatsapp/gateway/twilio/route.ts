import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"

export const runtime = "nodejs"

// GET /api/whatsapp/gateway/twilio
// Returns current Twilio Global Gateway configuration status for the workspace.
export async function GET() {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const gatewaySetting = await prisma.platformSetting.findUnique({
      where: { key: `twilio_gateway_${organizationId}` },
    })

    if (!gatewaySetting) {
      return NextResponse.json({
        configured: false,
        enabled: false,
        accountSid: null,
        messagingServiceSid: null,
        failoverMode: "AUTO_FAILOVER",
      })
    }

    const parsed = JSON.parse(gatewaySetting.value)

    return NextResponse.json({
      configured: true,
      enabled: Boolean(parsed.enabled),
      accountSid: parsed.accountSid ? `${parsed.accountSid.slice(0, 6)}••••••••••••` : null,
      messagingServiceSid: parsed.messagingServiceSid || null,
      failoverMode: parsed.failoverMode || "AUTO_FAILOVER",
      updatedAt: gatewaySetting.updatedAt,
    })
  } catch (error: any) {
    console.error("[TWILIO_GATEWAY_GET_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to load Twilio gateway config." }, { status: 500 })
  }
}

const twilioSchema = z.object({
  accountSid: z.string().startsWith("AC").length(34),
  authToken: z.string().min(16).max(64),
  messagingServiceSid: z.string().startsWith("MG").length(34).optional(),
  enabled: z.boolean().default(true),
  failoverMode: z.enum(["AUTO_FAILOVER", "TWILIO_PRIMARY", "FALLBACK_ONLY"]).default("AUTO_FAILOVER"),
})

// POST /api/whatsapp/gateway/twilio
// Configures or updates Twilio Multi-Channel Global Gateway fallback.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const body = await request.json()
    const input = twilioSchema.parse(body)

    const payload = {
      accountSid: input.accountSid,
      authToken: input.authToken,
      messagingServiceSid: input.messagingServiceSid || null,
      enabled: input.enabled,
      failoverMode: input.failoverMode,
      configuredAt: new Date().toISOString(),
    }

    await prisma.platformSetting.upsert({
      where: { key: `twilio_gateway_${organizationId}` },
      create: {
        key: `twilio_gateway_${organizationId}`,
        value: JSON.stringify(payload),
      },
      update: {
        value: JSON.stringify(payload),
      },
    })

    return NextResponse.json({
      ok: true,
      message: "Twilio Multi-Channel Global Gateway configured successfully.",
      configured: true,
      enabled: input.enabled,
    })
  } catch (error: any) {
    console.error("[TWILIO_GATEWAY_POST_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to save Twilio gateway config." }, { status: 500 })
  }
}
