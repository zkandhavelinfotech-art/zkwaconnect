import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

type FacebookPage = {
  id: string
  name: string
  category?: string
  link?: string
  is_published?: boolean
  tasks?: string[]
  verification_status?: string
  access_token?: string
  instagram_business_account?: {
    id: string
    username?: string
  }
}

type BusinessPagesEdge = {
  data: {
    id: string
    name: string
    category?: string
    link?: string
    permitted_tasks?: string[]
    tasks?: string[]
  }[]
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

    const connection = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED", accessTokenEncrypted: { not: null } },
      orderBy: { updatedAt: "desc" },
    })

    const token = connection?.accessTokenEncrypted
      ? (() => {
          try { return decryptMetaToken(connection.accessTokenEncrypted!) } catch { return null }
        })()
      : null

    if (!token) {
      return NextResponse.json({
        connected: false,
        pages: [],
        message: "No active Facebook connection. Please connect Facebook first.",
      })
    }

    // 1. Fetch Pages directly managed by the user (Instant access, no request needed)
    let managedPages: FacebookPage[] = []
    try {
      const managedRes = await metaGraph<{ data: FacebookPage[] }>(
        "me/accounts?fields=id,name,category,link,is_published,tasks,verification_status,access_token,instagram_business_account{id,username}&limit=100",
        token
      )
      managedPages = managedRes.data || []
    } catch {
      managedPages = []
    }

    // 2. Fetch Business Portfolios and their owned / client pages
    let businessPages: {
      businessId: string
      businessName: string
      ownedPages: { id: string; name: string; category?: string; link?: string }[]
      clientPages: { id: string; name: string; category?: string; link?: string }[]
    }[] = []

    try {
      const bizRes = await metaGraph<{ data: { id: string; name: string }[] }>("me/businesses?fields=id,name&limit=25", token)
      let bizList = bizRes.data || []

      // Prioritize active business portfolio 1707214344108990 (Recruitment Training Academy)
      if (!bizList.some(b => b.id === "1707214344108990")) {
        try {
          const directBiz = await metaGraph<{ id: string; name: string }>("1707214344108990?fields=id,name", token)
          if (directBiz?.id) bizList.unshift(directBiz)
        } catch { /* ignore */ }
      }

      for (const b of bizList) {
        const [owned, client] = await Promise.all([
          metaGraph<BusinessPagesEdge>(`${b.id}/owned_pages?fields=id,name,category,link&limit=50`, token).catch(() => ({ data: [] })),
          metaGraph<BusinessPagesEdge>(`${b.id}/client_pages?fields=id,name,category,link&limit=50`, token).catch(() => ({ data: [] })),
        ])
        businessPages.push({
          businessId: b.id,
          businessName: b.name,
          ownedPages: owned.data || [],
          clientPages: client.data || [],
        })
      }
    } catch {
      // Business pages fetch failed or restricted
    }

    // Always ensure 1707214344108990 is the primary active businessId if available
    const primaryBizId = businessPages.find(b => b.businessId === "1707214344108990")?.businessId || businessPages[0]?.businessId || "1707214344108990"

    return NextResponse.json({
      connected: true,
      managedPages: managedPages.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category || "General",
        link: p.link || `https://facebook.com/${p.id}`,
        isPublished: p.is_published !== false,
        tasks: p.tasks || [],
        hasFullControl: (p.tasks || []).includes("MANAGE"),
        instagram: p.instagram_business_account || null,
        approvalUrl: `https://www.facebook.com/${p.id}/settings/?tab=admin_roles`,
      })),
      businessPortfolios: businessPages,
      businessId: primaryBizId,
      agencyPartnerId: "246511357935583", // Zkandhavel Infotech Private Limited
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Facebook Pages." },
      { status: 500 }
    )
  }
}

// Resolves Facebook vanity name or URL into numeric Page ID without requiring restricted 'Page Public Metadata Access'
async function resolveFacebookPage(input: string, token: string): Promise<{ id: string; name: string; resolvedVia: string }> {
  const trimmed = input.trim()

  // 1. Direct query param: facebook.com/profile.php?id=100075867504434
  const queryMatch = trimmed.match(/[?&]id=(\d{10,25})/i)
  if (queryMatch) {
    return { id: queryMatch[1], name: `Page ${queryMatch[1]}`, resolvedVia: "url_query_id" }
  }

  // 2. Pure numeric Page ID entered directly
  if (/^\d{8,25}$/.test(trimmed)) {
    return { id: trimmed, name: `Page ${trimmed}`, resolvedVia: "numeric_id" }
  }

  // 3. Extract vanity name from URL or bare string
  let vanity = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^(?:www\.|m\.|web\.)?facebook\.com\//i, "")
    .replace(/^pages\/[^/]+\//i, "")
    .split(/[/?#]/)[0]
    .trim()

  // Check if vanity was actually numeric after URL stripping
  if (/^\d{8,25}$/.test(vanity)) {
    return { id: vanity, name: `Page ${vanity}`, resolvedVia: "path_id" }
  }

  // 4. Known client shortcuts
  if (vanity.toLowerCase() === "recruitmenttrainingacademy") {
    return { id: "100075867504434", name: "Recruitment Training Academy - RTA", resolvedVia: "known_client" }
  }

  // 5. Check if user already manages this page in me/accounts
  try {
    const accounts = await metaGraph<{ data: { id: string; name: string; link?: string }[] }>(
      "me/accounts?fields=id,name,link&limit=100",
      token
    )
    const match = accounts.data?.find(p =>
      p.name.toLowerCase() === vanity.toLowerCase() ||
      p.id === vanity ||
      (p.link && p.link.toLowerCase().includes(vanity.toLowerCase()))
    )
    if (match) {
      return { id: match.id, name: match.name, resolvedVia: "user_managed_pages" }
    }
  } catch {
    // continue
  }

  // 6. Scrape public OpenGraph metadata via Facebook crawler user-agent
  try {
    const targetUrl = `https://www.facebook.com/${encodeURIComponent(vanity)}`
    const fbRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    })

    if (fbRes.ok) {
      const html = await fbRes.text()
      const idMatch =
        html.match(/al:(?:android|ios):url["']\s+content=["']fb:\/\/(?:profile|page)\/(\d{10,25})/i) ||
        html.match(/fb:\/\/(?:profile|page)\/(\d{10,25})/i) ||
        html.match(/"pageID":"(\d{10,25})"/i) ||
        html.match(/"delegate_page_id":"(\d{10,25})"/i) ||
        html.match(/apple-argument=fb:\/\/(?:profile|page)\/(\d{10,25})/i) ||
        html.match(/facebook\.com\/profile\.php\?id=(\d{10,25})/i)

      const titleMatch =
        html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<title>([^<]+)<\/title>/i)
      const pageName = titleMatch ? titleMatch[1].replace(/\s*\|\s*Facebook$/i, "").trim() : vanity

      if (idMatch && idMatch[1]) {
        return { id: idMatch[1], name: pageName, resolvedVia: "opengraph_scraper" }
      }
    }
  } catch {
    // fallback
  }

  // 7. Fallback to Meta Graph API query if permission exists
  try {
    const pageInfo = await metaGraph<{ id: string; name: string }>(`${vanity}?fields=id,name`, token)
    if (pageInfo?.id) {
      return { id: pageInfo.id, name: pageInfo.name || vanity, resolvedVia: "graph_api" }
    }
  } catch {
    // Fails with (#10) on unreviewed apps without Public Metadata Access
  }

  throw new Error(
    `Could not automatically resolve numeric Page ID for "${vanity}". Meta requires numeric Page IDs. Please enter the numeric Page ID directly (for Recruitment Training Academy, use: 100075867504434).`
  )
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

    const connection = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED", accessTokenEncrypted: { not: null } },
      orderBy: { updatedAt: "desc" },
    })

    const token = connection?.accessTokenEncrypted
      ? (() => {
          try { return decryptMetaToken(connection.accessTokenEncrypted!) } catch { return null }
        })()
      : null

    if (!token) {
      return NextResponse.json({ error: "Connect Facebook first." }, { status: 409 })
    }

    const body = await request.json()
    const { action } = body

    if (action === "request_page_access") {
      const { pageId, businessId } = body
      if (!pageId) {
        return NextResponse.json({ error: "Page ID or URL is required." }, { status: 400 })
      }

      // Resolve numeric ID & Page Name
      let resolved: { id: string; name: string; resolvedVia: string }
      try {
        resolved = await resolveFacebookPage(pageId, token)
      } catch (err) {
        return NextResponse.json({
          error: err instanceof Error ? err.message : `Could not resolve Page ID for "${pageId}".`,
        }, { status: 400 })
      }

      // Determine target business
      let bId = businessId
      if (!bId) {
        const bizRes = await metaGraph<{ data: { id: string }[] }>("me/businesses?limit=1", token).catch(() => ({ data: [] }))
        bId = bizRes.data?.[0]?.id || "1707214344108990"
      }

      if (!bId) {
        return NextResponse.json({
          error: "No Meta Business Portfolio found to request page access into. Please select or create a Business Portfolio first.",
        }, { status: 400 })
      }

      const approvalUrl = `https://www.facebook.com/${resolved.id}/settings/?tab=admin_roles`
      const profileAccessUrl = `https://www.facebook.com/settings/?tab=profile_access`
      const partnerDirectUrl = `https://business.facebook.com/settings/pages?business_id=${bId}`

      // Attempt automated API request to client_pages
      try {
        const permittedTasks = ["ADVERTISE", "MESSAGING", "CREATE_CONTENT", "MODERATE", "ANALYZE"]
        const res = await metaGraph<{ success?: boolean; id?: string }>(
          `${bId}/client_pages`,
          token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              page_id: resolved.id,
              permitted_tasks: permittedTasks,
            }),
          }
        )

        return NextResponse.json({
          ok: true,
          pageId: resolved.id,
          pageName: resolved.name,
          businessId: bId,
          resolvedVia: resolved.resolvedVia,
          message: `✓ Access request successfully submitted to Facebook Page "${resolved.name}" (ID: ${resolved.id})! The Page Admin has been notified to approve.`,
          approvalUrl,
          profileAccessUrl,
          partnerDirectUrl,
        })
      } catch (apiErr) {
        const errMessage = apiErr instanceof Error ? apiErr.message : "Meta API error"

        // Handle personal profile error (ID starting with 1000...)
        if (errMessage.includes("global id") || errMessage.includes("not allowed for this call") || resolved.id.startsWith("1000")) {
          return NextResponse.json({
            error: `"${resolved.name}" (${resolved.id}) is a Personal Facebook Profile, not a Facebook Business Page. Meta Graph API only allows official Facebook Pages to be connected to WhatsApp and Business Portfolios.`,
            isProfileNotPage: true,
            pageId: resolved.id,
            pageName: resolved.name,
            createPageUrl: `https://business.facebook.com/settings/pages?business_id=${bId}`,
            message: `"${resolved.name}" is a personal profile. In Meta Business Suite (business_id=${bId}), go to Accounts → Pages → Add → Create a new Page (takes 30 seconds), or select one of your existing Facebook Pages.`,
          }, { status: 400 })
        }

        // Handle the classic Meta limit: "Can only add one client Page at a time"
        if (errMessage.includes("client Page") || errMessage.includes("limit") || errMessage.includes("100")) {
          return NextResponse.json({
            ok: false,
            pageId: resolved.id,
            pageName: resolved.name,
            limitReached: true,
            approvalUrl,
            profileAccessUrl,
            partnerDirectUrl,
            message: `Meta restriction: "Can only add one client Page at a time". Your Business Portfolio has an unverified or pending request. The Page Owner can bypass this instantly by adding your Business ID (${bId}) directly under Page Settings → Page Access → Partners.`,
          }, { status: 422 })
        }

        return NextResponse.json({
          error: `Meta rejected page access request: ${errMessage}`,
          pageId: resolved.id,
          pageName: resolved.name,
          approvalUrl,
          profileAccessUrl,
          partnerDirectUrl,
        }, { status: 400 })
      }
    }

    // Automated Partner Assignment (Client Page -> Settings -> Page Access -> Partners -> Assign Partner: business_id)
    if (action === "assign_partner") {
      const { pageId, partnerBusinessId: rawPartnerId, permittedTasks } = body
      if (!pageId) {
        return NextResponse.json({ error: "Page ID or URL is required." }, { status: 400 })
      }

      const partnerBusinessId = (rawPartnerId || "1707214344108990").trim()

      // Resolve numeric ID & Page Name
      let resolved: { id: string; name: string; resolvedVia: string }
      try {
        resolved = await resolveFacebookPage(pageId, token)
      } catch (err) {
        return NextResponse.json({
          error: err instanceof Error ? err.message : `Could not resolve Page ID for "${pageId}".`,
        }, { status: 400 })
      }

      // Check for Self-Assignment (Meta rejects sharing an asset with your own business ID)
      if (partnerBusinessId === "1707214344108990") {
        return NextResponse.json({
          ok: false,
          isSelfAssignment: true,
          partnerBusinessId,
          pageId: resolved.id,
          pageName: resolved.name,
          agencyPartnerId: "246511357935583",
          businessPagesUrl: `https://business.facebook.com/settings/pages?business_id=${partnerBusinessId}`,
          message: `Business Portfolio ${partnerBusinessId} is already your own business ("Recruitment Training Academy"). Meta does not allow assigning your own business ID as a partner because you already own the assets directly! To connect your Page, go to Accounts → Pages → Add Page in Meta Business Suite. To assign ZKWAConnect as an agency partner, use Agency ID: 246511357935583.`,
        }, { status: 422 })
      }

      // Check if trying to assign a personal user profile instead of a Facebook Page
      if (resolved.id.startsWith("1000")) {
        return NextResponse.json({
          ok: false,
          isProfileNotPage: true,
          pageId: resolved.id,
          pageName: resolved.name,
          partnerBusinessId,
          businessPagesUrl: `https://business.facebook.com/settings/pages?business_id=1707214344108990`,
          message: `"${resolved.name}" (${resolved.id}) is a Personal Facebook Profile, not an official Facebook Business Page. Meta only allows Facebook Pages to be shared with partners and connected to WhatsApp Business API. Create or connect an official Facebook Page under Meta Business Suite → Accounts → Pages.`,
        }, { status: 422 })
      }

      const tasks = Array.isArray(permittedTasks) && permittedTasks.length > 0
        ? permittedTasks
        : ["ADVERTISE", "MESSAGING", "CREATE_CONTENT", "MODERATE", "ANALYZE"]

      const directPartnerUrl = `https://www.facebook.com/${resolved.id}/settings/?tab=admin_roles`
      const newPagesExperienceUrl = `https://www.facebook.com/settings/?tab=profile_access`
      const businessSuitePartnerUrl = `https://business.facebook.com/settings/pages?business_id=${partnerBusinessId}`

      // Check if user has direct Page Access Token in me/accounts
      let pageAccessToken: string | null = null
      try {
        const accountsRes = await metaGraph<{ data: { id: string; name: string; access_token?: string }[] }>(
          "me/accounts?fields=id,name,access_token&limit=100",
          token
        )
        const matched = accountsRes.data?.find(p => p.id === resolved.id)
        if (matched?.access_token) {
          pageAccessToken = matched.access_token
        }
      } catch {
        // continue
      }

      // Attempt Graph API partner assignment: POST /{page-id}/agencies
      let assignedOk = false
      let apiResponse: any = null
      let lastError: string | null = null
      const tokenToUse = pageAccessToken || token

      try {
        const res = await metaGraph<{ success?: boolean; id?: string }>(
          `${resolved.id}/agencies`,
          tokenToUse,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              business: partnerBusinessId,
              permitted_tasks: tasks,
            }),
          }
        )
        if (res.success || res.id) {
          assignedOk = true
          apiResponse = res
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Error assigning agency"
      }

      // Fallback: try /{partnerBusinessId}/client_pages
      if (!assignedOk) {
        try {
          const res = await metaGraph<{ success?: boolean; id?: string }>(
            `${partnerBusinessId}/client_pages`,
            token,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                page_id: resolved.id,
                permitted_tasks: tasks,
              }),
            }
          )
          if (res.success || res.id) {
            assignedOk = true
            apiResponse = res
          }
        } catch (err) {
          if (!lastError) lastError = err instanceof Error ? err.message : "Error adding client page"
        }
      }

      if (assignedOk) {
        return NextResponse.json({
          ok: true,
          pageId: resolved.id,
          pageName: resolved.name,
          partnerBusinessId,
          message: `✓ Partner successfully assigned! Business Portfolio (${partnerBusinessId}) now has partner access to Facebook Page "${resolved.name}" (${resolved.id}).`,
          directPartnerUrl,
          newPagesExperienceUrl,
          businessSuitePartnerUrl,
        })
      }

      return NextResponse.json({
        ok: false,
        needsManualAssignment: true,
        pageId: resolved.id,
        pageName: resolved.name,
        partnerBusinessId,
        tasks,
        directPartnerUrl,
        newPagesExperienceUrl,
        businessSuitePartnerUrl,
        lastError,
        message: `To complete partner assignment: Have the Page Owner open Facebook Page Settings → Page Access → Partners and add Partner ID: ${partnerBusinessId}`,
      })
    }

    if (action === "inspect_page") {
      const { pageId } = body
      if (!pageId) return NextResponse.json({ error: "Page ID is required." }, { status: 400 })

      const page = await metaGraph<{
        id: string
        name: string
        category?: string
        link?: string
        is_published?: boolean
        verification_status?: string
      }>(`${pageId}?fields=id,name,category,link,is_published,verification_status`, token)

      return NextResponse.json({ ok: true, page })
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Page operation failed." },
      { status: 500 }
    )
  }
}

