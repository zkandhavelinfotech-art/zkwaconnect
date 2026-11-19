import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { activateWaba } from "@/lib/onboarding/activate-waba"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

const schema = z.object({
  wabaId: z.string().min(5),
  phoneNumberId: z.string().optional(),
  name: z.string().optional(),
  businessId: z.string().optional(),
})

// POST /api/whatsapp/accounts/connect
// Explicitly connects and activates a WABA asset for the workspace.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized. Sign in to continue." }, { status: 401 })
    }

    const body = await request.json()
    const input = schema.parse(body)

    const conn = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    })

    if (!conn?.accessToken) {
      return NextResponse.json(
        { error: "No active Meta authorization token found for this workspace.", status: "ACTION_REQUIRED" },
        { status: 400 }
      )
    }

    // Inspect WABA via Meta Graph API
    const waba = await metaGraph<{ id: string; name: string; currency?: string; timezone_id?: string; owner_business_info?: { id?: string } }>(
      `${input.wabaId}?fields=id,name,currency,timezone_id,owner_business_info`,
      conn.accessToken
    )

    const result = await activateWaba({
      organizationId,
      businessId: input.businessId || waba.owner_business_info?.id || null,
      waba,
    })

    return NextResponse.json({
      ok: true,
      status: "CONNECTED",
      wabaId: waba.id,
      name: waba.name,
      phoneReady: result.phoneReady,
      message: `WABA ${waba.name} successfully connected to workspace.`,
    })
  } catch (error: any) {
    console.error("[WHATSAPP_ACCOUNTS_CONNECT_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to connect WhatsApp account." }, { status: 500 })
  }
}
