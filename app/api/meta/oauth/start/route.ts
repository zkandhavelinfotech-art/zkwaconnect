import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { graphVersion, metaRedirectUri } from "@/lib/meta/graph"
import { popupResult } from "@/lib/meta/popup"
import { META_SCOPES } from "@/lib/meta/scopes"
import { metaLoginConfig } from "@/lib/meta/config"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const session = await getSession()
  const organizationId = session?.user.memberships[0]?.organizationId
  const popup = request.nextUrl.searchParams.get("popup") === "1"
  if (!organizationId)
    return popup ? popupResult(request.nextUrl.origin, { ok: false, error: "session_expired" }, "/login")
      : NextResponse.redirect(new URL("/login", request.url))

  const requested = request.nextUrl.searchParams.get("returnTo") || ""
  const returnTo = requested.startsWith("/onboarding") && !requested.startsWith("//") ? requested.split("?")[0] : ""
  if (!metaLoginConfig().ready)
    return popup ? popupResult(request.nextUrl.origin, { ok: false, error: "meta_config_missing" }, returnTo || "/onboarding/meta-connect")
      : NextResponse.redirect(new URL(`${returnTo || "/onboarding/meta-connect"}?error=meta_config_missing`, request.url))
  const appId = process.env.META_APP_ID!

  const state = crypto.randomBytes(32).toString("hex")
  const stateHash = crypto.createHash("sha256").update(state).digest("hex")
  await prisma.oAuthState.create({
    data: { organizationId, stateHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  })

  const oauthUrl = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`)
  oauthUrl.searchParams.set("client_id", appId)
  oauthUrl.searchParams.set("redirect_uri", metaRedirectUri(request.nextUrl.origin))
  oauthUrl.searchParams.set("state", state)
  oauthUrl.searchParams.set("response_type", "code")
  oauthUrl.searchParams.set("scope", META_SCOPES.map(item => item.scope).join(","))
  // Facebook's compact dialog for login in a popup window.
  if (popup) oauthUrl.searchParams.set("display", "popup")
  const response = NextResponse.redirect(oauthUrl)
  response.cookies.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/meta/oauth",
  })
  // Lets the setup wizard (/onboarding) receive the user back instead of the separate step pages.
  response.cookies.set("meta_oauth_popup", popup ? "1" : "", { httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", maxAge: popup ? 600 : 0, path: "/api/meta/oauth" })
  if (returnTo)
    response.cookies.set("meta_oauth_return", returnTo, { httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", maxAge: 600, path: "/api/meta/oauth" })
  return response
}