import { NextResponse } from "next/server"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

// GET /api/meta/permissions-request
// Queries live Meta Developer App details, assigned roles, permissions status, and submission links.
export async function GET() {
  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "1710743377107186"
  const appSecret = process.env.META_APP_SECRET || ""
  const businessId = process.env.META_AGENCY_BUSINESS_ID || "246511357935583"

  let appPermissions: any[] = []
  let appDetails: any = null
  let appRoles: any[] = []
  let errorNote: string | null = null

  if (appId && appSecret) {
    const appToken = `${appId}|${appSecret}`
    try {
      const res = await metaGraph<{ data?: any[] }>(`${appId}/permissions`, appToken)
      appPermissions = res?.data || []
    } catch (err: any) {
      errorNote = err.message || "Could not query App permissions."
    }

    try {
      appDetails = await metaGraph<any>(
        `${appId}?fields=name,category,link,privacy_policy_url,terms_of_service_url,contact_email`,
        appToken
      )
    } catch {}

    try {
      const rolesRes = await metaGraph<{ data?: any[] }>(`${appId}/roles`, appToken)
      appRoles = rolesRes?.data || []
    } catch {}
  }

  const requiredPermissions = [
    {
      permission: "whatsapp_business_management",
      description: "Read & manage WhatsApp Business Accounts, phone numbers, and templates.",
      recommendedTier: "Advanced Access",
      directSubmissionUrl: `https://developers.facebook.com/apps/${appId}/app-review/permissions/?search=whatsapp_business_management`,
    },
    {
      permission: "whatsapp_business_messaging",
      description: "Send and receive real-time WhatsApp messages via Cloud API.",
      recommendedTier: "Advanced Access",
      directSubmissionUrl: `https://developers.facebook.com/apps/${appId}/app-review/permissions/?search=whatsapp_business_messaging`,
    },
    {
      permission: "business_management",
      description: "Read client business portfolio assets and partner assignment.",
      recommendedTier: "Advanced Access",
      directSubmissionUrl: `https://developers.facebook.com/apps/${appId}/app-review/permissions/?search=business_management`,
    },
  ]

  const statusMap = new Map<string, string>()
  for (const item of appPermissions) {
    if (item.permission) {
      statusMap.set(item.permission, item.status || "standard_access")
    }
  }

  const permissionsStatus = requiredPermissions.map(p => {
    const liveStatus = statusMap.get(p.permission) || "standard_access"
    const hasAdvanced = liveStatus.toLowerCase().includes("advanced")
    return {
      ...p,
      currentTier: liveStatus,
      liveAccessLevel: liveStatus,
      isAdvancedAccess: hasAdvanced,
      hasAdvancedAccess: hasAdvanced,
      actionNeeded: !hasAdvanced,
    }
  })

  return NextResponse.json({
    ok: true,
    appId,
    businessId,
    appDetails: appDetails || {
      name: "rtawaba-zkwaconnect",
      category: "Education",
      contact_email: "freelancerswaminathan@gmail.com",
      id: appId,
    },
    appRoles,
    permissionsStatus,
    requiredPermissions: permissionsStatus,
    allAdvancedGranted: permissionsStatus.every(p => p.isAdvancedAccess),
    errorNote,
    links: {
      appDashboard: `https://developers.facebook.com/apps/${appId}/dashboard/`,
      appReviewDashboard: `https://developers.facebook.com/apps/${appId}/app-review/`,
      permissionsAndFeatures: `https://developers.facebook.com/apps/${appId}/app-review/permissions/`,
      rolesDashboard: `https://developers.facebook.com/apps/${appId}/roles/roles/`,
      businessVerification: `https://business.facebook.com/settings/security?business_id=${businessId}`,
      techProviderRegistration: `https://developers.facebook.com/docs/whatsapp/tech-providers`,
    },
  })
}

// POST /api/meta/permissions-request
// Automated actions: grant app role access to users, or verify Cloud API connectivity directly.
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action, userId, role } = body
    const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "1710743377107186"
    const appSecret = process.env.META_APP_SECRET || ""
    const appToken = `${appId}|${appSecret}`

    if (action === "grant_role") {
      if (!userId || !userId.trim()) {
        return NextResponse.json({ error: "Please enter a valid Meta / Facebook User ID." }, { status: 400 })
      }
      const targetRole = role || "testers"
      const url = `https://graph.facebook.com/v25.0/${appId}/roles`
      
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${appToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ user: userId.trim(), role: targetRole }).toString(),
      })
      const data = await res.json()
      
      if (!res.ok || data.error) {
        return NextResponse.json({
          ok: false,
          error: data.error?.message || `Meta requires adding user ${userId} via App Roles dashboard directly.`,
          directUrl: `https://developers.facebook.com/apps/${appId}/roles/roles/`,
        }, { status: 400 })
      }

      return NextResponse.json({
        ok: true,
        message: `✓ Success! User ID ${userId} was granted '${targetRole}' access on Meta App ${appId}.`,
      })
    }

    if (action === "test_api") {
      const testRes = await fetch(`https://graph.facebook.com/v25.0/${appId}?fields=name,category,link,contact_email`, {
        headers: { Authorization: `Bearer ${appToken}` },
      })
      const testData = await testRes.json()
      if (!testRes.ok || testData.error) {
        return NextResponse.json({ ok: false, error: testData.error?.message || "Meta API test failed." }, { status: 400 })
      }

      return NextResponse.json({
        ok: true,
        message: `✓ Meta Cloud API verified! App '${testData.name || appId}' is active and communicating with Meta servers.`,
        app: testData,
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to process request." }, { status: 500 })
  }
}
