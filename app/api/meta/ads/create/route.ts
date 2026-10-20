import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken, getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { AD_TYPES, SPECIAL_CATEGORIES, buildTargeting, toMinorUnits, type AdType } from "@/lib/meta/ads"

export const runtime = "nodejs"
export const maxDuration = 60

type Edge<T> = { data: T[] }
type Page = { id: string; name: string; access_token?: string; picture?: { data?: { url?: string } }; instagram_business_account?: { id: string; username?: string; profile_picture_url?: string } }

async function context() {
  const organizationId = await getOnboardingOrganizationId()
  if (!organizationId) throw Object.assign(new Error("Sign in to continue."), { status: 401 })
  const accessToken = await getMetaAccessToken(organizationId)
  if (!accessToken) throw Object.assign(new Error("Connect Facebook first."), { status: 409 })
  return { organizationId, accessToken }
}

function failure(error: unknown) {
  const status = (error as { status?: number })?.status || 400
  return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status })
}

// Everything the wizard needs: ad accounts, Pages (with linked Instagram), Lead Forms, WhatsApp numbers and permissions.
export async function GET() {
  try {
    const { organizationId, accessToken } = await context()
    const [permissions, accounts, pages, phones] = await Promise.all([
      metaGraph<Edge<{ permission: string; status: string }>>("me/permissions", accessToken).catch(() => ({ data: [] })),
      metaGraph<Edge<{ id: string; name?: string; account_status?: number; currency?: string; timezone_name?: string }>>(
        "me/adaccounts?fields=id,name,account_status,currency,timezone_name&limit=100", accessToken).catch(() => ({ data: [] })),
      metaGraph<Edge<Page>>("me/accounts?fields=id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}&limit=100", accessToken)
        .catch(() => ({ data: [] as Page[] })),
      prisma.phoneNumber.findMany({ where: { status: "CONNECTED", waba: { organizationId, status: "CONNECTED" } }, select: { phoneNumber: true, displayName: true } }),
    ])
    const granted = new Set(permissions.data.filter(item => item.status === "granted").map(item => item.permission))
    const missing = ["ads_management", "pages_manage_ads", "pages_show_list"].filter(scope => !granted.has(scope))
    const leadForms = await Promise.all(pages.data.map(page =>
      metaGraph<Edge<{ id: string; name: string; status?: string }>>(`${page.id}/leadgen_forms?fields=id,name,status&limit=50`, page.access_token || accessToken)
        .then(edge => edge.data.filter(form => form.status !== "ARCHIVED").map(form => ({ id: form.id, name: form.name, pageId: page.id })))
        .catch(() => [])))
    return NextResponse.json({
      missingPermissions: missing,
      adAccounts: accounts.data.map(account => ({ id: account.id, name: account.name || account.id, currency: account.currency || "INR",
        timezone: account.timezone_name || null, active: account.account_status === 1 })),
      pages: pages.data.map(page => ({ id: page.id, name: page.name, picture: page.picture?.data?.url || null,
        instagram: page.instagram_business_account ? { id: page.instagram_business_account.id, username: page.instagram_business_account.username || null,
          picture: page.instagram_business_account.profile_picture_url || null } : null })),
      leadForms: leadForms.flat(),
      whatsappNumbers: phones,
      types: AD_TYPES,
    })
  } catch (error) { return failure(error) }
}

const locationSchema = z.object({ key: z.string().min(1).max(40), name: z.string().max(200), type: z.enum(["country", "region", "city"]), countryCode: z.string().optional() })
const createSchema = z.object({
  adType: z.enum(["WHATSAPP", "INSTAGRAM_DIRECT", "WEBSITE", "LEAD_FORM"]),
  name: z.string().trim().min(2).max(120),
  adAccountId: z.string().regex(/^act_\d+$/),
  pageId: z.string().regex(/^\d+$/),
  instagramUserId: z.string().regex(/^\d+$/).optional().or(z.literal("")),
  targeting: z.object({
    locations: z.array(locationSchema).max(25),
    ageMin: z.number().int().min(18).max(65), ageMax: z.number().int().min(18).max(65),
    gender: z.enum(["ALL", "MALE", "FEMALE"]),
    platforms: z.array(z.enum(["facebook", "instagram"])).min(1),
    specialCategory: z.enum(SPECIAL_CATEGORIES),
  }),
  dailyBudget: z.number().positive().max(10_000_000),
  startTime: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  endTime: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  creative: z.object({
    primaryText: z.string().trim().min(1).max(2000),
    headline: z.string().trim().max(255).default(""),
    description: z.string().trim().max(255).default(""),
    websiteUrl: z.string().trim().url().optional().or(z.literal("")),
    callToAction: z.string().min(2).max(40),
    leadFormId: z.string().regex(/^\d+$/).optional().or(z.literal("")),
    imageBase64: z.string().min(100).max(7_500_000),
    imageName: z.string().max(200).default("ad-image.jpg"),
  }),
})

// Creates campaign → ad set → image → creative → ad, all PAUSED. Rolls the campaign back if any step fails.
export async function POST(request: Request) {
  let campaignId: string | null = null
  let accessToken = ""
  try {
    const ctx = await context()
    accessToken = ctx.accessToken
    const input = createSchema.parse(await request.json())
    const type = AD_TYPES[input.adType as AdType]
    if (input.targeting.ageMin > input.targeting.ageMax) return NextResponse.json({ error: "Minimum age must be below maximum age." }, { status: 400 })
    if (input.adType === "WEBSITE" && !input.creative.websiteUrl) return NextResponse.json({ error: "Add the website URL people should visit." }, { status: 400 })
    if (input.adType === "LEAD_FORM" && !input.creative.leadFormId) return NextResponse.json({ error: "Choose a Lead Form." }, { status: 400 })
    if (input.adType === "INSTAGRAM_DIRECT" && !input.instagramUserId) return NextResponse.json({ error: "This Page has no linked Instagram account." }, { status: 400 })
    if (!type.ctas.some(cta => cta.value === input.creative.callToAction)) return NextResponse.json({ error: "Choose a valid button." }, { status: 400 })

    const account = await metaGraph<{ currency?: string }>(`${input.adAccountId}?fields=currency`, accessToken)
    const post = <T>(path: string, body: Record<string, unknown>) => metaGraph<T>(path, accessToken, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

    const campaign = await post<{ id: string }>(`${input.adAccountId}/campaigns`, {
      name: input.name, objective: type.objective, status: "PAUSED",
      special_ad_categories: input.targeting.specialCategory === "NONE" ? [] : [input.targeting.specialCategory],
      is_adset_budget_sharing_enabled: false,
    })
    campaignId = campaign.id

    const start = input.startTime ? new Date(input.startTime) : new Date(Date.now() + 10 * 60_000)
    const adSet = await post<{ id: string }>(`${input.adAccountId}/adsets`, {
      name: `${input.name} · Ad set`, campaign_id: campaign.id, status: "PAUSED",
      daily_budget: toMinorUnits(input.dailyBudget, account.currency || "INR"),
      billing_event: "IMPRESSIONS", optimization_goal: type.optimizationGoal, bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      destination_type: type.destinationType, promoted_object: { page_id: input.pageId },
      targeting: buildTargeting(input.targeting, input.adType as AdType),
      start_time: start.toISOString(), ...(input.endTime ? { end_time: new Date(input.endTime).toISOString() } : {}),
    })

    const upload = await post<{ images?: Record<string, { hash: string }> }>(`${input.adAccountId}/adimages`, {
      bytes: input.creative.imageBase64.replace(/^data:image\/\w+;base64,/, ""), name: input.creative.imageName })
    const imageHash = Object.values(upload.images || {})[0]?.hash
    if (!imageHash) throw new Error("Meta didn't accept the image.")

    const cta = input.creative.callToAction
    const linkData: Record<string, unknown> = { message: input.creative.primaryText, image_hash: imageHash,
      ...(input.creative.headline ? { name: input.creative.headline } : {}), ...(input.creative.description ? { description: input.creative.description } : {}) }
    if (input.adType === "WHATSAPP") Object.assign(linkData, { link: "https://api.whatsapp.com/send",
      call_to_action: { type: cta, value: { app_destination: "WHATSAPP" } } })
    if (input.adType === "INSTAGRAM_DIRECT") Object.assign(linkData, { link: "https://www.instagram.com/",
      call_to_action: { type: cta, value: { app_destination: "INSTAGRAM_DIRECT" } } })
    if (input.adType === "WEBSITE") Object.assign(linkData, { link: input.creative.websiteUrl, call_to_action: { type: cta, value: { link: input.creative.websiteUrl } } })
    if (input.adType === "LEAD_FORM") Object.assign(linkData, { link: "http://fb.me/", call_to_action: { type: cta, value: { lead_gen_form_id: input.creative.leadFormId } } })

    const creative = await post<{ id: string }>(`${input.adAccountId}/adcreatives`, {
      name: `${input.name} · Creative`,
      object_story_spec: { page_id: input.pageId, ...(input.instagramUserId ? { instagram_user_id: input.instagramUserId } : {}), link_data: linkData },
    })
    const ad = await post<{ id: string }>(`${input.adAccountId}/ads`, {
      name: `${input.name} · Ad`, adset_id: adSet.id, creative: { creative_id: creative.id }, status: "PAUSED" })

    const accountNumber = input.adAccountId.replace("act_", "")
    return NextResponse.json({ ok: true, campaignId: campaign.id, adSetId: adSet.id, adId: ad.id, creativeId: creative.id,
      adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNumber}&selected_campaign_ids=${campaign.id}`,
      message: "Ad created and paused. Review it, then activate to start spending." }, { status: 201 })
  } catch (error) {
    // Don't leave a half-built campaign behind in the customer's ad account.
    if (campaignId && accessToken) await metaGraph(campaignId, accessToken, { method: "DELETE" }).catch(() => null)
    if (error instanceof z.ZodError) return NextResponse.json({ error: `${error.issues[0]?.path.join(".")}: ${error.issues[0]?.message}` }, { status: 400 })
    return failure(error)
  }
}

const activateSchema = z.object({ campaignId: z.string().regex(/^\d+$/), adSetId: z.string().regex(/^\d+$/), adId: z.string().regex(/^\d+$/),
  action: z.enum(["activate", "pause"]) })

// Turns the created campaign, ad set and ad on (spends money) or off.
export async function PATCH(request: Request) {
  try {
    const { accessToken } = await context()
    const input = activateSchema.parse(await request.json())
    const status = input.action === "activate" ? "ACTIVE" : "PAUSED"
    for (const id of input.action === "activate" ? [input.campaignId, input.adSetId, input.adId] : [input.adId, input.adSetId, input.campaignId])
      await metaGraph(id, accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    return NextResponse.json({ ok: true, status, message: status === "ACTIVE" ? "Ad is live and will start delivering after Meta's review." : "Ad paused." })
  } catch (error) { return failure(error) }
}
