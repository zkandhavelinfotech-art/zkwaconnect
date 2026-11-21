import { NextResponse } from "next/server"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

// GET /api/meta/permissions-request
// Inspects App Review access tiers (standard vs advanced access) and returns 1-click submission links.
export async function GET() {
  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "1406836967735338"
  const appSecret = process.env.META_APP_SECRET || ""
  const businessId = process.env.META_AGENCY_BUSINESS_ID || "246511357935583"

  let appPermissions: any[] = []
  let errorNote: string | null = null

  if (appId && appSecret) {
    try {
      const appToken = `${appId}|${appSecret}`
      const res = await metaGraph<{ data?: any[] }>(
        `${appId}/permissions`,
        appToken
      )
      appPermissions = res?.data || []
    } catch (err: any) {
      errorNote = err.message || "Could not query App permissions."
    }
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
    permissionsStatus,
    requiredPermissions: permissionsStatus,
    allAdvancedGranted: permissionsStatus.every(p => p.isAdvancedAccess),
    errorNote,
    links: {
      appReviewDashboard: `https://developers.facebook.com/apps/${appId}/app-review/`,
      permissionsAndFeatures: `https://developers.facebook.com/apps/${appId}/app-review/permissions/`,
      businessVerification: `https://business.facebook.com/settings/security?business_id=${businessId}`,
      techProviderRegistration: `https://developers.facebook.com/docs/whatsapp/tech-providers`,
    },
  })
}
