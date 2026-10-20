import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { metaRedirectUri } from "@/lib/meta/graph"
import { exchangeCode, exchangeForLongLived, saveMetaConnection } from "@/lib/meta/connection"
import { popupResult } from "@/lib/meta/popup"

export const runtime = "nodejs"

function safePath(value: string | undefined) {
  return value && value.startsWith("/onboarding") && !value.startsWith("//") ? value : null
}

function returnToSetup(request: NextRequest, error?: string, reason?: string | null) {
  const back = safePath(request.cookies.get("meta_oauth_return")?.value)
  const target = new URL(back || (error ? "/onboarding/meta-connect" : "/onboarding/waba-setup"), request.url)
  if (error) target.searchParams.set("error", error)
  if (reason) target.searchParams.set("reason", reason.slice(0, 200))
  // Popup logins report back to the opening tab instead of navigating.
  const response = request.cookies.get("meta_oauth_popup")?.value === "1"
    ? popupResult(request.nextUrl.origin, { ok: !error, error, reason: reason?.slice(0, 200) || null }, `${target.pathname}${target.search}`)
    : NextResponse.redirect(target)
  for (const name of ["meta_oauth_state", "meta_oauth_return", "meta_oauth_popup"])
    response.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/api/meta/oauth" })
  return response
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (searchParams.has("error") || !code || !state)
    return returnToSetup(request, "oauth_denied", searchParams.get("error_description") || searchParams.get("error_reason"))
  if (request.cookies.get("meta_oauth_state")?.value !== state)
    return returnToSetup(request, "oauth_state_invalid")

  const stateHash = crypto.createHash("sha256").update(state).digest("hex")
  const storedState = await prisma.oAuthState.findUnique({ where: { stateHash } })
  if (!storedState || storedState.expiresAt <= new Date()) {
    if (storedState) await prisma.oAuthState.delete({ where: { id: storedState.id } })
    return returnToSetup(request, "oauth_state_expired")
  }

  const consumed = await prisma.oAuthState.deleteMany({
    where: { stateHash, expiresAt: { gt: new Date() } },
  })
  if (consumed.count !== 1) return returnToSetup(request, "oauth_state_expired")

  try {
    const short = await exchangeCode(code, metaRedirectUri(request.nextUrl.origin))
    const longLived = await exchangeForLongLived(short.accessToken)
    await saveMetaConnection(storedState.organizationId, { accessToken: longLived.accessToken, expiresIn: longLived.expiresIn ?? 5_184_000 })
    return returnToSetup(request)
  } catch (error) {
    return returnToSetup(request, "oauth_exchange_failed", error instanceof Error ? error.message : null)
  }
}
