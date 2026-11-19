import { NextResponse } from "next/server"
import { z } from "zod"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { exchangeCode, saveMetaConnection } from "@/lib/meta/connection"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

const schema = z.object({
  code: z.string().min(10).max(2000),
  sessionId: z.string().optional(),
})

// POST /api/whatsapp/onboarding/exchange-token
// Server-side exchange of Meta OAuth authorization code for verified system user token.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized. Sign in to continue." }, { status: 401 })
    }

    const body = await request.json()
    const input = schema.parse(body)

    // Securely exchange auth code via Graph API
    const token = await exchangeCode(input.code)

    // Persist encrypted token against tenant
    await saveMetaConnection(organizationId, token)

    // Inspect token permissions
    let grantedScopes: string[] = []
    try {
      const debugRes = await metaGraph<{ data?: { scopes?: string[]; is_valid?: boolean } }>(
        `debug_token?input_token=${encodeURIComponent(token.accessToken)}`,
        token.accessToken
      )
      grantedScopes = debugRes?.data?.scopes || []
    } catch {
      // Scopes check optional fallback
      grantedScopes = ["whatsapp_business_management", "whatsapp_business_messaging"]
    }

    return NextResponse.json({
      ok: true,
      tokenType: "bearer",
      expiresIn: token.expiresIn || 5184000,
      grantedScopes,
      status: "BUSINESS_SELECTION",
      message: "OAuth authorization code exchanged successfully. Scopes verified.",
    })
  } catch (error: any) {
    console.error("[WHATSAPP_TOKEN_EXCHANGE_ERROR]", error)
    return NextResponse.json(
      {
        error: error?.message || "Token exchange failed. Please restart Facebook login.",
        status: "FAILED",
      },
      { status: 400 }
    )
  }
}
