import { NextResponse } from "next/server"
import { metaLoginConfig } from "@/lib/meta/config"
import { META_SCOPES } from "@/lib/meta/scopes"

export const runtime = "nodejs"

// GET /api/whatsapp/onboarding/config
// Supplies client SDK with Embedded Signup v4 launch parameters without exposing secrets.
export async function GET() {
  const config = metaLoginConfig()
  const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || ""
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID || process.env.META_CONFIG_ID || ""
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v25.0"
  const agencyId = process.env.META_AGENCY_BUSINESS_ID || "246511357935583" // Zkandhavel Infotech Private Limited
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI || "https://app.zkwaconnect.in/api/meta/oauth/callback"

  return NextResponse.json({
    ok: true,
    ready: config.ready,
    missing: config.missing,
    appId,
    configId,
    graphVersion,
    sdkVersion: "v25.0",
    embeddedSignupVersion: "v4",
    techProviderName: "Zkandhavel Infotech Private Limited",
    agencyBusinessId: agencyId,
    redirectUri,
    scopes: META_SCOPES.map(s => s.scope),
    features: {
      zeroCopyPartnerAssignment: true,
      automaticPhoneRegistration: true,
      embeddedSignupV4Migration: true,
      twilioOptionalGateway: true,
    },
  })
}
