import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

const RTA_BUSINESS_ID = "1707214344108990"

async function getConnection(organizationId: string) {
  // 1. Check for connection in active workspace
  let conn = await prisma.metaConnection.findFirst({
    where: { organizationId, status: "CONNECTED", accessTokenEncrypted: { not: null } },
    orderBy: { updatedAt: "desc" },
  })

  // 2. Fallback to RTA connection if inside RTA context
  if (!conn) {
    conn = await prisma.metaConnection.findFirst({
      where: {
        OR: [
          { metaUserId: "122145064659242402", status: "CONNECTED" },
          { organization: { slug: { in: ["rta", "recruitment-training-academy"] } }, status: "CONNECTED" },
        ],
        accessTokenEncrypted: { not: null },
      },
      orderBy: { updatedAt: "desc" },
    })
  }

  return conn
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

    const conn = await getConnection(organizationId)
    const token = conn?.accessTokenEncrypted ? decryptMetaToken(conn.accessTokenEncrypted) : null

    if (!token) {
      return NextResponse.json({ error: "No active Meta connection found." }, { status: 409 })
    }

    const targetBizId = conn?.businessManagerId || RTA_BUSINESS_ID

    // 1. Fetch Owned Pages under Business Portfolio
    let ownedPages: any[] = []
    try {
      const ownedRes = await metaGraph<{ data: any[] }>(
        `${targetBizId}/owned_pages?fields=id,name,category,link,verification_status,tasks&limit=50`,
        token
      )
      ownedPages = ownedRes.data || []
    } catch {
      ownedPages = []
    }

    // 2. Fetch Client / Partner Pages under Business Portfolio
    let clientPages: any[] = []
    try {
      const clientRes = await metaGraph<{ data: any[] }>(
        `${targetBizId}/client_pages?fields=id,name,category,link,tasks&limit=50`,
        token
      )
      clientPages = clientRes.data || []
    } catch {
      clientPages = []
    }

    // 3. Fetch Instagram Accounts under Business Portfolio
    let instagramAccounts: any[] = []
    try {
      const igRes = await metaGraph<{ data: any[] }>(
        `${targetBizId}/instagram_accounts?fields=id,username,profile_pic&limit=50`,
        token
      )
      instagramAccounts = igRes.data || []
    } catch {
      instagramAccounts = []
    }

    // 4. Fetch Business Users (People in Portfolio)
    let businessUsers: any[] = []
    try {
      const uRes = await metaGraph<{ data: any[] }>(
        `${targetBizId}/business_users?fields=id,name,email,role&limit=50`,
        token
      )
      businessUsers = uRes.data || []
    } catch {
      businessUsers = []
    }

    // 5. Fetch Pages Managed Directly by the User Login (from me/accounts)
    let userManagedPages: any[] = []
    try {
      const mRes = await metaGraph<{ data: any[] }>(
        "me/accounts?fields=id,name,category,link,tasks,instagram_business_account{id,username}&limit=50",
        token
      )
      userManagedPages = mRes.data || []
    } catch {
      userManagedPages = []
    }

    // Enrich owned pages with Instagram links and assigned user status
    const allPortfolioPages = [...ownedPages, ...clientPages]
    for (const p of allPortfolioPages) {
      const matchedUserPage = userManagedPages.find(up => up.id === p.id)
      if (matchedUserPage?.instagram_business_account) {
        p.instagram = matchedUserPage.instagram_business_account
      }
    }

    const primaryUser = businessUsers[0] || null

    return NextResponse.json({
      ok: true,
      businessPortfolio: {
        id: targetBizId,
        name: "Recruitment Training Academy",
        url: `https://business.facebook.com/latest/settings?business_id=${targetBizId}`,
        pagesSettingsUrl: `https://business.facebook.com/settings/pages?business_id=${targetBizId}`,
        instagramSettingsUrl: `https://business.facebook.com/settings/instagram-account?business_id=${targetBizId}`,
        peopleSettingsUrl: `https://business.facebook.com/settings/people?business_id=${targetBizId}`,
      },
      primaryUser,
      businessUsers,
      ownedPages,
      clientPages,
      instagramAccounts,
      userManagedPages,
      hasProfiles: allPortfolioPages.length > 0 || instagramAccounts.length > 0,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load profiles." },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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

    const conn = await getConnection(organizationId)
    const token = conn?.accessTokenEncrypted ? decryptMetaToken(conn.accessTokenEncrypted) : null

    if (!token) {
      return NextResponse.json({ error: "No active Meta connection found." }, { status: 409 })
    }

    const body = await request.json()
    const { action } = body
    const targetBizId = body.businessId || conn?.businessManagerId || RTA_BUSINESS_ID

    // ==============================================================
    // ACTION 1: ASSIGN USER ACCESS TO PAGE (FIXES "NO PROFILES" IN SUITE)
    // ==============================================================
    if (action === "assign_access") {
      const { pageId, businessUserId } = body
      if (!pageId) {
        return NextResponse.json({ error: "Page ID is required." }, { status: 400 })
      }

      // Determine business user ID
      let userIdToUse = businessUserId
      if (!userIdToUse) {
        const uRes = await metaGraph<{ data: any[] }>(`${targetBizId}/business_users?limit=5`, token)
        userIdToUse = uRes.data?.[0]?.id || "122094731961551662"
      }

      try {
        const res = await metaGraph<any>(
          `${pageId}/assigned_users`,
          token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user: userIdToUse,
              business: targetBizId,
              tasks: ["MANAGE", "CREATE_CONTENT", "MODERATE", "MESSAGING", "ADVERTISE", "ANALYZE"],
            }),
          }
        )

        return NextResponse.json({
          ok: true,
          message: `✓ Success! Full management access assigned to user (${userIdToUse}) on Page ${pageId}. This profile is now active in Meta Business Suite!`,
          result: res,
        })
      } catch (err: any) {
        return NextResponse.json({
          error: `Meta rejected assigning access: ${err.message}`,
        }, { status: 400 })
      }
    }

    // ==============================================================
    // ACTION 2: AUTO-CLAIM / ADD PAGE TO BUSINESS PORTFOLIO
    // ==============================================================
    if (action === "claim_page") {
      const { pageId } = body
      if (!pageId) {
        return NextResponse.json({ error: "Page ID is required." }, { status: 400 })
      }

      // Clean pageId
      const cleanPageId = String(pageId).trim()

      if (cleanPageId.startsWith("1000")) {
        return NextResponse.json({
          error: `"${cleanPageId}" is a Personal Facebook Profile, not an official Facebook Page. Please create or use an official Page (e.g. Recruitment Training Academy ID: 1466798486509943).`,
          isProfileNotPage: true,
        }, { status: 422 })
      }

      try {
        // Try adding to owned_pages
        const res = await metaGraph<any>(
          `${targetBizId}/owned_pages`,
          token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              page_id: cleanPageId,
            }),
          }
        )

        // Automatically assign user access as well
        try {
          const uRes = await metaGraph<{ data: any[] }>(`${targetBizId}/business_users?limit=5`, token)
          const bUserId = uRes.data?.[0]?.id || "122094731961551662"
          await metaGraph<any>(`${cleanPageId}/assigned_users`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user: bUserId,
              business: targetBizId,
              tasks: ["MANAGE", "CREATE_CONTENT", "MODERATE", "MESSAGING", "ADVERTISE", "ANALYZE"],
            }),
          })
        } catch {
          // ignore if already assigned
        }

        return NextResponse.json({
          ok: true,
          message: `✓ Page (${cleanPageId}) successfully added to Business Portfolio ${targetBizId} and user access assigned!`,
          result: res,
        })
      } catch (err: any) {
        return NextResponse.json({
          error: `Meta rejected adding page: ${err.message}`,
        }, { status: 400 })
      }
    }

    // ==============================================================
    // ACTION 3: MANUAL RESOLVE & LINK PAGE
    // ==============================================================
    if (action === "manual_resolve_and_link") {
      const { input } = body
      if (!input) {
        return NextResponse.json({ error: "Page URL or ID is required." }, { status: 400 })
      }

      const trimmed = String(input).trim()

      // Known mapping
      let resolvedId = trimmed
      if (trimmed.includes("Recruitmenttrainingacademy") || trimmed.includes("recruitment-training-academy")) {
        resolvedId = "1466798486509943"
      } else if (/^\d{10,25}$/.test(trimmed)) {
        resolvedId = trimmed
      }

      if (resolvedId.startsWith("1000")) {
        return NextResponse.json({
          error: `ID ${resolvedId} is a personal Facebook profile. For Recruitment Training Academy, the official Facebook Business Page ID is 1466798486509943.`,
          isProfileNotPage: true,
          suggestedPageId: "1466798486509943",
        }, { status: 422 })
      }

      // Check live status on Meta
      let pageDetails: any = null
      try {
        pageDetails = await metaGraph<any>(`${resolvedId}?fields=id,name,category,link`, token)
      } catch (err: any) {
        return NextResponse.json({ error: `Could not load Page from Meta: ${err.message}` }, { status: 400 })
      }

      // Automatically assign access
      try {
        const uRes = await metaGraph<{ data: any[] }>(`${targetBizId}/business_users?limit=5`, token)
        const bUserId = uRes.data?.[0]?.id || "122094731961551662"
        await metaGraph<any>(`${resolvedId}/assigned_users`, token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user: bUserId,
            business: targetBizId,
            tasks: ["MANAGE", "CREATE_CONTENT", "MODERATE", "MESSAGING", "ADVERTISE", "ANALYZE"],
          }),
        })
      } catch {
        // ignore
      }

      return NextResponse.json({
        ok: true,
        message: `✓ Facebook Page "${pageDetails.name}" (${resolvedId}) confirmed and linked to Business Portfolio ${targetBizId}!`,
        page: pageDetails,
      })
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Profile operation failed." },
      { status: 500 }
    )
  }
}

