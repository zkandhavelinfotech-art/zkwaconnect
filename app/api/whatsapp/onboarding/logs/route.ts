import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { getOnboardingLifecycle } from "@/lib/whatsapp/lifecycle"

export const runtime = "nodejs"

// GET /api/whatsapp/onboarding/logs
// Retrieves the authoritative lifecycle snapshot and chronological audit log history for a workspace.
export async function GET() {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const [lifecycle, events] = await Promise.all([
      getOnboardingLifecycle(organizationId),
      prisma.webhookEvent.findMany({
        where: {
          organizationId,
          eventType: { startsWith: "ONBOARDING_" },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ])

    const auditLogs = events.map(event => {
      const p = (event.payload as any) || {}
      return {
        id: event.id,
        eventType: event.eventType.replace(/^ONBOARDING_/, ""),
        statusFrom: p.statusFrom || null,
        statusTo: p.statusTo || null,
        clientMessage: p.sanitizedMessage || "Lifecycle event recorded.",
        rawError: p.rawError || null,
        createdAt: event.createdAt,
      }
    })

    return NextResponse.json({
      ok: true,
      lifecycle,
      auditLogs,
    })
  } catch (error: any) {
    console.error("[ONBOARDING_LOGS_GET_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to retrieve onboarding logs." }, { status: 500 })
  }
}
