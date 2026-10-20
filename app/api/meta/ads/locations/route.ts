import { NextRequest, NextResponse } from "next/server"
import { getMetaAccessToken, getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

type Result = { key: string; name: string; type: string; country_code?: string; region?: string; country_name?: string }

// Location search for ad targeting (countries, states/regions and cities).
export async function GET(request: NextRequest) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error: "Connect Facebook first." }, { status: 409 })
    const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 60)
    if (query.length < 2) return NextResponse.json({ locations: [] })
    const types = encodeURIComponent(JSON.stringify(["country", "region", "city"]))
    const result = await metaGraph<{ data: Result[] }>(`search?type=adgeolocation&q=${encodeURIComponent(query)}&location_types=${types}&limit=10`, accessToken)
    return NextResponse.json({ locations: result.data.filter(item => ["country", "region", "city"].includes(item.type)).map(item => ({
      key: item.key, type: item.type, countryCode: item.country_code,
      name: [item.name, item.type === "city" ? item.region : null, item.type !== "country" ? item.country_name || item.country_code : null].filter(Boolean).join(", "),
    })) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Location search failed." }, { status: 400 })
  }
}
