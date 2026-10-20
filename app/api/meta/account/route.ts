import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { graphVersion, metaGraph } from "@/lib/meta/graph"
import { metaLoginConfig } from "@/lib/meta/config"
import { isWabaSubscribed } from "@/lib/meta/waba"
import { META_SCOPES } from "@/lib/meta/scopes"

export const runtime = "nodejs"

type Phone = { id: string; display_phone_number?: string; verified_name?: string; quality_rating?: string; code_verification_status?: string; name_status?: string; status?: string }

function message(error: unknown) {
  return error instanceof Error ? error.message : "Meta request failed"
}

// Connected Meta details for a workspace: Business Manager, WABA, phone numbers and token health. Never returns secrets.
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const requested = request.nextUrl.searchParams.get("organizationId")
    const isAdmin = session.user.adminRole !== "NONE"
    const organizationId = requested && isAdmin ? requested : session.user.memberships[0]?.organizationId
    if (!organizationId) return NextResponse.json({ error: requested ? "Admin access required." : "No workspace found." }, { status: requested ? 403 : 404 })

    const [organization, connection, wabas, onboarding] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, createdAt: true, status: true } }),
      prisma.metaConnection.findFirst({ where: { organizationId }, orderBy: { updatedAt: "desc" } }),
      prisma.waba.findMany({ where: { organizationId }, include: { phoneNumbers: true }, orderBy: { updatedAt: "desc" } }),
      prisma.onboarding.findUnique({ where: { organizationId } }),
    ])
    if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 404 })

    const warnings: string[] = []
    const token = connection?.accessTokenEncrypted ? (() => { try { return decryptMetaToken(connection.accessTokenEncrypted!) } catch { return null } })() : null
    if (connection?.accessTokenEncrypted && !token) warnings.push("The stored token can't be decrypted — ENCRYPTION_KEY may have changed. Reconnect Facebook.")

    let profile: { id: string; name?: string } | null = null
    let tokenError: string | null = null
    if (token) profile = await metaGraph<{ id: string; name?: string }>("me?fields=id,name", token).catch(error => { tokenError = message(error); return null })

    // Token type, expiry and granted permissions come from Meta's debug_token, which needs the app's own token.
    let debug: { type?: string; scopes?: string[]; expires_at?: number; data_access_expires_at?: number } | null = null
    if (token && metaLoginConfig().ready) {
      const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
      debug = await fetch(`https://graph.facebook.com/${graphVersion()}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`,
        { cache: "no-store", signal: AbortSignal.timeout(15000) }).then(response => response.json()).then(body => body.data || null).catch(() => null)
    }

    const active = wabas.find(waba => waba.status === "CONNECTED") || null
    const businessId = active?.metaBusinessId || connection?.businessManagerId || null
    const business = token && businessId ? await metaGraph<{ id: string; name?: string; verification_status?: string }>(`${businessId}?fields=id,name,verification_status`, token)
      .catch(error => { warnings.push(`Business Manager: ${message(error)}`); return null }) : null

    let activeLive: { name?: string; account_review_status?: string; currency?: string; timezone_id?: string } | null = null
    let subscribed: boolean | null = null
    let livePhones: Phone[] = []
    if (token && active) {
      [activeLive, subscribed, livePhones] = await Promise.all([
        metaGraph<{ name?: string; account_review_status?: string; currency?: string; timezone_id?: string }>(`${active.wabaId}?fields=name,account_review_status,currency,timezone_id`, token)
          .catch(error => { warnings.push(`WhatsApp account: ${message(error)}`); return null }),
        isWabaSubscribed(active.wabaId, token).then(result => result.subscribed).catch(() => null),
        metaGraph<{ data: Phone[] }>(`${active.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status&limit=50`, token)
          .then(result => result.data).catch(error => { warnings.push(`Phone numbers: ${message(error)}`); return [] }),
      ])
    }

    const required = META_SCOPES.map(item => item.scope)
    const granted = debug?.scopes || null
    return NextResponse.json({
      organization,
      viewer: { isAdmin, viewingOther: Boolean(requested && isAdmin), canManage: ["OWNER", "ADMIN"].includes(session.user.memberships.find(item => item.organizationId === organizationId)?.role || "") },
      connection: connection ? {
        status: connection.status, connectedAt: connection.connectedAt, lastSyncedAt: connection.lastSyncedAt,
        tokenStored: Boolean(connection.accessTokenEncrypted),
        tokenValid: Boolean(profile), tokenError,
        facebookUser: profile ? { id: profile.id, name: profile.name || null } : connection.metaUserId ? { id: connection.metaUserId, name: null } : null,
        tokenType: debug?.type || null,
        expiresAt: debug?.expires_at ? new Date(debug.expires_at * 1000) : connection.tokenExpiresAt,
        dataAccessExpiresAt: debug?.data_access_expires_at ? new Date(debug.data_access_expires_at * 1000) : null,
        permissions: granted ? required.map(scope => ({ scope, granted: granted.includes(scope) })) : null,
      } : null,
      business: businessId ? { id: businessId, name: business?.name || null, verificationStatus: business?.verification_status || null } : null,
      activeWaba: active ? {
        id: active.id, wabaId: active.wabaId, name: activeLive?.name || active.name, reviewStatus: activeLive?.account_review_status || active.verificationStatus,
        currency: activeLive?.currency || active.currency, timezone: activeLive?.timezone_id || active.timezone, webhookSubscribed: subscribed,
        phones: active.phoneNumbers.map(phone => {
          const live = livePhones.find(item => item.id === phone.phoneNumberId)
          return { phoneNumberId: phone.phoneNumberId, display: live?.display_phone_number || phone.phoneNumber, verifiedName: live?.verified_name || phone.displayName,
            status: phone.status, registered: phone.status === "CONNECTED" && phone.verificationStatus === "VERIFIED",
            quality: live?.quality_rating || phone.qualityRating, nameStatus: live?.name_status || null, metaStatus: live?.status || null,
            messagingLimit: phone.messagingLimit }
        }),
        unlinkedPhones: livePhones.filter(item => !active.phoneNumbers.some(phone => phone.phoneNumberId === item.id))
          .map(item => ({ phoneNumberId: item.id, display: item.display_phone_number || "", verifiedName: item.verified_name || null })),
      } : null,
      otherWabas: wabas.filter(waba => waba.id !== active?.id).map(waba => ({ wabaId: waba.wabaId, name: waba.name, status: waba.status, phones: waba.phoneNumbers.length })),
      onboarding: { metaConnected: Boolean(profile), wabaCreated: Boolean(active), phoneRegistered: Boolean(active?.phoneNumbers.some(phone => phone.status === "CONNECTED")),
        completedAt: onboarding?.completedAt || null },
      warnings,
    })
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 })
  }
}
