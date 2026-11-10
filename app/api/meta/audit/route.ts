import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { graphVersion, metaGraph, metaRedirectUri } from "@/lib/meta/graph"
import { META_SCOPES } from "@/lib/meta/scopes"

export const runtime = "nodejs"

type MetaBusiness = {
  id: string
  name: string
  verification_status?: string
  legal_name?: string
  created_time?: string
}

type MetaWaba = {
  id: string
  name: string
  currency?: string
  timezone_id?: string
  account_review_status?: string
}

type MetaPhone = {
  id: string
  display_phone_number: string
  verified_name?: string
  quality_rating?: string
  code_verification_status?: string
  status?: string
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    }

    const membership = session.user.memberships[0]
    const organizationId = membership?.organizationId
    if (!organizationId) {
      return NextResponse.json({ error: "No organization found." }, { status: 400 })
    }

    const env = process.env
    const appId = env.META_APP_ID || ""
    const appSecret = env.META_APP_SECRET || ""
    const verifyToken = env.META_VERIFY_TOKEN || ""
    const configId = env.NEXT_PUBLIC_META_CONFIG_ID || ""
    const appUrl = (env.APP_URL || env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "")

    // 1. App configuration checks
    const appConfig = {
      appId: appId || null,
      appIdValid: /^\d{10,20}$/.test(appId),
      hasSecret: Boolean(appSecret && !/your-|replace-/i.test(appSecret)),
      verifyTokenSet: Boolean(verifyToken && verifyToken.length >= 8),
      configIdSet: /^\d{5,25}$/.test(configId),
      callbackUrl: `${appUrl}/api/webhooks/whatsapp`,
      redirectUri: env.META_OAUTH_REDIRECT_URI || metaRedirectUri(appUrl),
    }

    // 2. Database connection check
    const connection = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED", accessTokenEncrypted: { not: null } },
      orderBy: { updatedAt: "desc" },
    })

    const token = connection?.accessTokenEncrypted
      ? (() => {
          try { return decryptMetaToken(connection.accessTokenEncrypted!) } catch { return null }
        })()
      : null

    let userProfile: { id: string; name: string } | null = null
    let permissions: { scope: string; status: string }[] = []
    let businesses: MetaBusiness[] = []
    let discoveredWabas: {
      id: string
      name: string
      businessId: string
      businessName: string
      currency?: string
      timezone?: string
      reviewStatus?: string
      phones: MetaPhone[]
    }[] = []
    let tokenError: string | null = null

    if (token) {
      // Fetch user profile
      try {
        userProfile = await metaGraph<{ id: string; name: string }>("me?fields=id,name", token)
      } catch (err) {
        tokenError = err instanceof Error ? err.message : "Token validation failed"
      }

      // Fetch user permissions
      try {
        const permsRes = await metaGraph<{ data: { permission: string; status: string }[] }>("me/permissions", token)
        permissions = (permsRes.data || []).map(p => ({ scope: p.permission, status: p.status }))
      } catch {
        // Ignored
      }

      // Fetch businesses
      try {
        const bizRes = await metaGraph<{ data: MetaBusiness[] }>(
          "me/businesses?fields=id,name,verification_status,legal_name&limit=50",
          token
        ).catch(() => metaGraph<{ data: MetaBusiness[] }>("me/businesses?fields=id,name&limit=50", token))

        businesses = bizRes.data || []
      } catch {
        businesses = []
      }

      // Fetch WABAs under each business
      const seenWabas = new Set<string>()
      for (const b of businesses) {
        try {
          const [owned, client] = await Promise.all([
            metaGraph<{ data: MetaWaba[] }>(`${b.id}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id,account_review_status&limit=50`, token).catch(() => ({ data: [] })),
            metaGraph<{ data: MetaWaba[] }>(`${b.id}/client_whatsapp_business_accounts?fields=id,name,currency,timezone_id,account_review_status&limit=50`, token).catch(() => ({ data: [] })),
          ])

          const list = [...owned.data, ...client.data]
          for (const w of list) {
            if (seenWabas.has(w.id)) continue
            seenWabas.add(w.id)

            // Get phones
            let phones: MetaPhone[] = []
            try {
              const pRes = await metaGraph<{ data: MetaPhone[] }>(
                `${w.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status&limit=20`,
                token
              )
              phones = pRes.data || []
            } catch {
              phones = []
            }

            discoveredWabas.push({
              id: w.id,
              name: w.name,
              businessId: b.id,
              businessName: b.name,
              currency: w.currency,
              timezone: w.timezone_id,
              reviewStatus: w.account_review_status,
              phones,
            })
          }
        } catch {
          // Continue to next business
        }
      }

      // Also check direct me/whatsapp_business_accounts
      try {
        const directWabas = await metaGraph<{ data: MetaWaba[] }>(
          "me/whatsapp_business_accounts?fields=id,name,currency,timezone_id,account_review_status&limit=50",
          token
        ).catch(() => ({ data: [] }))

        for (const w of directWabas.data || []) {
          if (seenWabas.has(w.id)) continue
          seenWabas.add(w.id)

          let phones: MetaPhone[] = []
          try {
            const pRes = await metaGraph<{ data: MetaPhone[] }>(
              `${w.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status&limit=20`,
              token
            )
            phones = pRes.data || []
          } catch {
            phones = []
          }

          discoveredWabas.push({
            id: w.id,
            name: w.name,
            businessId: "direct",
            businessName: "Direct WhatsApp Account",
            currency: w.currency,
            timezone: w.timezone_id,
            reviewStatus: w.account_review_status,
            phones,
          })
        }
      } catch {
        // Direct WABA call failed
      }
    }

    // 3. Webhook ping test
    let webhookHandshakeOk = false
    try {
      const challenge = `audit_${Date.now()}`
      const testRes = await fetch(
        `${request.nextUrl.origin}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${challenge}`,
        { cache: "no-store", signal: AbortSignal.timeout(5000) }
      )
      const echoed = await testRes.text()
      webhookHandshakeOk = echoed === challenge
    } catch {
      webhookHandshakeOk = false
    }

    // 4. Required scopes analysis
    const requiredScopes = META_SCOPES.map(s => s.scope)
    const grantedScopes = permissions.filter(p => p.status === "granted").map(p => p.scope)
    const missingScopes = requiredScopes.filter(s => !grantedScopes.includes(s))

    // 5. Active database WABA
    const activeWaba = await prisma.waba.findFirst({
      where: { organizationId, status: "CONNECTED" },
      include: { phoneNumbers: true },
    })

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      appConfig,
      webhookHandshakeOk,
      facebookUser: userProfile,
      tokenError,
      hasConnectedToken: Boolean(token),
      permissions: {
        allGranted: missingScopes.length === 0,
        granted: grantedScopes,
        missing: missingScopes,
      },
      businesses: businesses.map(b => ({
        id: b.id,
        name: b.name,
        verificationStatus: b.verification_status || "not_verified",
        isVerified: b.verification_status === "verified",
        legalName: b.legal_name || null,
      })),
      discoveredWabas,
      activeWaba: activeWaba
        ? {
            id: activeWaba.id,
            wabaId: activeWaba.wabaId,
            name: activeWaba.name,
            status: activeWaba.status,
            phones: activeWaba.phoneNumbers.map(p => ({
              id: p.id,
              phoneNumberId: p.phoneNumberId,
              phoneNumber: p.phoneNumber,
              displayName: p.displayName,
              status: p.status,
              verificationStatus: p.verificationStatus,
            })),
          }
        : null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Diagnostic audit failed." },
      { status: 500 }
    )
  }
}

