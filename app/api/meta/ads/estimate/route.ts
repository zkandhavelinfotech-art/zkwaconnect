import { NextResponse } from "next/server"
import { z } from "zod"
import { getMetaAccessToken, getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { AD_TYPES, SPECIAL_CATEGORIES, buildTargeting, type AdType } from "@/lib/meta/ads"

export const runtime = "nodejs"

const schema = z.object({
  adAccountId: z.string().regex(/^act_\d+$/),
  adType: z.enum(["WHATSAPP", "INSTAGRAM_DIRECT", "WEBSITE", "LEAD_FORM"]),
  targeting: z.object({
    locations: z.array(z.object({ key: z.string(), name: z.string(), type: z.enum(["country", "region", "city"]) })).max(25),
    ageMin: z.number().int().min(18).max(65), ageMax: z.number().int().min(18).max(65),
    gender: z.enum(["ALL", "MALE", "FEMALE"]), platforms: z.array(z.enum(["facebook", "instagram"])).min(1),
    specialCategory: z.enum(SPECIAL_CATEGORIES),
  }),
})

type Estimate = { data?: { estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number; estimate_dau?: number; estimate_ready?: boolean }[] }

// Monthly audience size Meta expects for this targeting.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error: "Connect Facebook first." }, { status: 409 })
    const input = schema.parse(await request.json())
    const spec = encodeURIComponent(JSON.stringify(buildTargeting(input.targeting, input.adType as AdType)))
    const result = await metaGraph<Estimate>(`${input.adAccountId}/delivery_estimate?optimization_goal=${AD_TYPES[input.adType as AdType].optimizationGoal}&targeting_spec=${spec}`, accessToken)
    const row = result.data?.[0]
    return NextResponse.json({ lower: row?.estimate_mau_lower_bound ?? null, upper: row?.estimate_mau_upper_bound ?? null,
      daily: row?.estimate_dau ?? null, ready: row?.estimate_ready ?? false })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't estimate reach." }, { status: 400 })
  }
}
