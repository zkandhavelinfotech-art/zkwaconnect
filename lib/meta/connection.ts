import { prisma } from "@/lib/db/prisma"
import { encryptMetaToken } from "@/lib/meta/token"
import { graphVersion, metaGraph } from "@/lib/meta/graph"

// Exchanges a Facebook Login authorization code for an access token. redirectUri is required for the
// redirect flow and must be omitted for codes from the JavaScript SDK (Embedded Signup).
export async function exchangeCode(code: string, redirectUri?: string) {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) throw new Error("Meta OAuth is not configured")
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`)
  url.searchParams.set("client_id", appId)
  url.searchParams.set("client_secret", appSecret)
  if (redirectUri) url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("code", code)
  const response = await fetch(url, { cache: "no-store" })
  const body = await response.json() as { access_token?: string; expires_in?: number; error?: { message?: string } }
  if (!response.ok || !body.access_token) throw new Error(body.error?.message || "Could not exchange Meta authorization code")
  return { accessToken: body.access_token, expiresIn: body.expires_in }
}

export async function exchangeForLongLived(accessToken: string) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`)
  url.searchParams.set("grant_type", "fb_exchange_token")
  url.searchParams.set("client_id", process.env.META_APP_ID || "")
  url.searchParams.set("client_secret", process.env.META_APP_SECRET || "")
  url.searchParams.set("fb_exchange_token", accessToken)
  const response = await fetch(url, { cache: "no-store" })
  const body = await response.json() as { access_token?: string; expires_in?: number; error?: { message?: string } }
  if (!response.ok || !body.access_token) throw new Error(body.error?.message || "Could not obtain a long-lived Meta token")
  return { accessToken: body.access_token, expiresIn: body.expires_in }
}

// Stores the workspace's Meta token (encrypted) and marks the Meta step of onboarding done.
export async function saveMetaConnection(organizationId: string, token: { accessToken: string; expiresIn?: number }) {
  const profile = await metaGraph<{ id: string }>("me?fields=id", token.accessToken)
  const data = {
    metaUserId: profile.id, accessTokenEncrypted: encryptMetaToken(token.accessToken), status: "CONNECTED" as const, connectedAt: new Date(),
    // Embedded Signup business tokens have no expiry; user tokens last about 60 days.
    tokenExpiresAt: token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null,
  }
  const existing = await prisma.metaConnection.findFirst({ where: { organizationId } })
  if (existing) await prisma.metaConnection.update({ where: { id: existing.id }, data })
  else await prisma.metaConnection.create({ data: { organizationId, ...data } })

  const onboarding = await prisma.onboarding.findUnique({ where: { organizationId } })
  if (onboarding?.phoneVerified) {
    await prisma.onboarding.update({ where: { organizationId }, data: { metaConnected: true } })
  } else {
    await prisma.onboarding.upsert({
      where: { organizationId },
      create: { organizationId, metaConnected: true, currentStep: "WABA_PENDING", status: "WABA_PENDING" },
      update: { metaConnected: true, currentStep: "WABA_PENDING", status: "WABA_PENDING" },
    })
  }
  return profile.id
}
