import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken, getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { subscribeWaba } from "@/lib/meta/waba"
import { activateWaba } from "@/lib/onboarding/activate-waba"

export const runtime = "nodejs"

type Business = { id: string; name: string; verification_status?: string }
type Waba = { id: string; name: string; currency?: string; timezone_id?: string; account_review_status?: string }
type Phone = { id: string; display_phone_number: string; verified_name?: string; quality_rating?: string; code_verification_status?: string }
type Edge<T> = { data: T[] }

function message(error: unknown) {
  return error instanceof Error ? error.message : "Meta request failed"
}

// Lists every WhatsApp Business Account the connected Meta user can reach, grouped by business portfolio.
export async function GET() {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error: "Connect your Meta account first." }, { status: 409 })

    const errors: string[] = []
    const businesses = await metaGraph<Edge<Business>>("me/businesses?fields=id,name,verification_status&limit=100", accessToken)
      .catch(() => metaGraph<Edge<Business>>("me/businesses?fields=id,name&limit=100", accessToken))

    const listWabas = async (business: Business, edge: "owned" | "client") => {
      const path = `${business.id}/${edge}_whatsapp_business_accounts`
      // Retry with basic fields so one unsupported field never hides an account.
      return metaGraph<Edge<Waba>>(`${path}?fields=id,name,currency,timezone_id,account_review_status&limit=100`, accessToken)
        .catch(() => metaGraph<Edge<Waba>>(`${path}?fields=id,name&limit=100`, accessToken))
        .then(result => result.data.map(waba => ({ ...waba, ownership: edge })))
        .catch(error => { if (edge === "owned") errors.push(`${business.name}: ${message(error)}`); return [] })
    }

    const seen = new Set<string>()
    const groups = await Promise.all(businesses.data.map(async business => {
      const found = (await Promise.all([listWabas(business, "owned"), listWabas(business, "client")])).flat()
        .filter(waba => !seen.has(waba.id) && seen.add(waba.id))
      return { business, wabas: found }
    }))

    const allIds = groups.flatMap(group => group.wabas.map(waba => waba.id))
    const saved = await prisma.waba.findMany({ where: { wabaId: { in: allIds } }, select: { wabaId: true, organizationId: true, status: true } })

    const result = await Promise.all(groups.map(async ({ business, wabas }) => ({
      id: business.id, name: business.name, verificationStatus: business.verification_status || null,
      wabas: await Promise.all(wabas.map(async waba => {
        const phones = await metaGraph<Edge<Phone>>(`${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status&limit=50`, accessToken)
          .then(edge => edge.data).catch(() => null)
        const row = saved.find(item => item.wabaId === waba.id)
        return {
          id: waba.id, name: waba.name, currency: waba.currency || null, timezone: waba.timezone_id || null,
          reviewStatus: waba.account_review_status || null, ownership: waba.ownership, phones,
          active: row?.organizationId === organizationId && row.status === "CONNECTED",
          linkedElsewhere: Boolean(row && row.organizationId !== organizationId),
        }
      })),
    })))

    // Kept for older clients: a flat list in the original shape.
    const flat = result.flatMap(group => group.wabas.map(waba => ({ id: waba.id, name: waba.name, currency: waba.currency, timezone_id: waba.timezone,
      businessId: group.id, businessName: group.name })))
    return NextResponse.json({ businesses: result, wabas: flat, errors })
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 502 })
  }
}

const selectSchema = z.object({
  wabaId: z.string().regex(/^\d{5,30}$/),
  businessId: z.string().regex(/^\d{5,30}$/),
})

// Makes the chosen WABA this workspace's single active WhatsApp Business API account.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error: "Connect your Meta account first." }, { status: 409 })
    const input = selectSchema.parse(await request.json())

    const waba = await metaGraph<Waba>(`${input.wabaId}?fields=id,name,currency,timezone_id`, accessToken)
    const existing = await prisma.waba.findUnique({ where: { wabaId: waba.id } })
    if (existing && existing.organizationId !== organizationId)
      return NextResponse.json({ error: "This WhatsApp account is already linked to another ZKWAConnect workspace." }, { status: 409 })

    const { phoneReady: hasRegisteredPhone } = await activateWaba({ organizationId, businessId: input.businessId, waba })

    // Without this subscription Meta never sends this WABA's incoming messages to our webhook.
    let warning: string | undefined
    try { await subscribeWaba(waba.id, accessToken) }
    catch (error) { warning = `WhatsApp account saved, but webhook subscription failed: ${message(error)}. Retry from Settings → WhatsApp.` }

    const redirect = hasRegisteredPhone ? "/onboarding/complete" : "/onboarding/phone-registration"
    return NextResponse.json({ ok: true, wabaId: waba.id, name: waba.name, warning, redirect })
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 })
  }
}
