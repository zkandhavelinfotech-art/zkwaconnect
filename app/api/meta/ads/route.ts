import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken, getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

type Edge<T> = { data: T[] }
type AdAccount = { id: string; name?: string; account_status?: number; currency?: string; timezone_name?: string }
type MetaPage = { id: string; name: string; access_token: string }
type LeadForm = { id: string; name: string; status?: string; leads_count?: number }
type LeadValue = { name: string; values?: string[]; value?: string }
type MetaLead = { id: string; created_time?: string; ad_id?: string; campaign_id?: string; field_data?: LeadValue[] }
type AdCampaign = {
  id: string
  name: string
  status?: string
  effective_status?: string
  objective?: string
  updated_time?: string
}
type AdSet = {
  campaign_id: string
  destination_type?: string
  promoted_object?: Record<string, unknown>
}
type Ad = {
  campaign_id: string
  effective_status?: string
  creative?: Record<string, unknown>
}

async function getMetaContext() {
  const organizationId = await getOnboardingOrganizationId()
  if (!organizationId) throw new Error("Sign in to continue.")
  const accessToken = await getMetaAccessToken(organizationId)
  if (!accessToken) throw new Error("Connect your Meta account first.")
  return { organizationId, accessToken }
}

async function getLeadForms(accessToken: string) {
  const pages = await metaGraph<Edge<MetaPage>>("me/accounts?fields=id,name,access_token&limit=100", accessToken)
  const errors: string[] = []
  const pageForms = await Promise.all(pages.data.map(async page => {
    try {
      const forms = await metaGraph<Edge<LeadForm>>(
        `${page.id}/leadgen_forms?fields=id,name,status,leads_count&limit=100`, page.access_token || accessToken,
      )
      return forms.data.map(form => ({ ...form, pageId: page.id, pageName: page.name, pageAccessToken: page.access_token }))
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Could not read a Page's Lead Forms.")
      return []
    }
  }))
  return { pages: pages.data, forms: pageForms.flat(), errors }
}

function collectUrls(value: unknown, output: Set<string>, depth = 0) {
  if (depth > 6 || value == null) return
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) output.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, output, depth + 1)
    return
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/^(link|link_url|object_url|website_url)$/i.test(key) && typeof item === "string" && /^https?:\/\//i.test(item))
        output.add(item)
      else collectUrls(item, output, depth + 1)
    }
  }
}

function fieldsRecord(fields: LeadValue[] = []) {
  return Object.fromEntries(fields.map(field => [
    field.name.toLowerCase(),
    (field.values?.length ? field.values : field.value ? [field.value] : []).join(", "),
  ]))
}

async function getSelectedForm(accessToken: string, formId: string) {
  const assets = await getLeadForms(accessToken)
  const form = assets.forms.find(item => item.id === formId)
  if (!form) throw new Error("That Lead Form is not accessible to this Meta account.")
  return form
}

export async function GET(request: Request) {
  try {
    const { accessToken } = await getMetaContext()
    const url = new URL(request.url)
    const requestedAccountId = url.searchParams.get("adAccountId") || ""
    const requestedFormId = url.searchParams.get("formId") || ""

    const [accountResult, leadAssets] = await Promise.all([
      metaGraph<Edge<AdAccount>>("me/adaccounts?fields=id,name,account_status,currency,timezone_name&limit=100", accessToken),
      getLeadForms(accessToken),
    ])
    const accounts = accountResult.data
    const adAccount = requestedAccountId ? accounts.find(account => account.id === requestedAccountId) : accounts[0]
    if (requestedAccountId && !adAccount)
      return NextResponse.json({ error: "That ad account is not accessible to this Meta user." }, { status: 403 })

    let campaigns: Array<AdCampaign & { campaignType: "CTWA" | "WEBSITE" | "OTHER"; websiteUrls: string[]; deliveryStatus: string; metrics: { impressions: number; clicks: number; spend: string } }> = []
    let pixels: Array<{ id: string; name?: string }> = []
    if (adAccount) {
      const accountPath = adAccount.id
      const [campaignResult, adSetResult, adResult, insightResult, pixelResult] = await Promise.all([
        metaGraph<Edge<AdCampaign>>(`${accountPath}/campaigns?fields=id,name,status,effective_status,objective,updated_time&limit=100`, accessToken),
        metaGraph<Edge<AdSet>>(`${accountPath}/adsets?fields=campaign_id,destination_type,promoted_object&limit=200`, accessToken),
        metaGraph<Edge<Ad>>(`${accountPath}/ads?fields=campaign_id,effective_status,creative{link_url,object_url,object_story_spec}&limit=300`, accessToken)
          .catch(() => ({ data: [] })),
        metaGraph<Edge<{ campaign_id: string; impressions?: string; clicks?: string; spend?: string }>>(
          `${accountPath}/insights?level=campaign&fields=campaign_id,impressions,clicks,spend&date_preset=last_7d&limit=500`, accessToken,
        ).catch(() => ({ data: [] })),
        metaGraph<Edge<{ id: string; name?: string }>>(`${accountPath}/adspixels?fields=id,name&limit=100`, accessToken)
          .catch(() => ({ data: [] })),
      ])

      const metrics = new Map(insightResult.data.map(item => [item.campaign_id, item]))
      campaigns = campaignResult.data.map(campaign => {
        const relatedAdSets = adSetResult.data.filter(adSet => adSet.campaign_id === campaign.id)
        const relatedAds = adResult.data.filter(ad => ad.campaign_id === campaign.id)
        const urls = new Set<string>()
        for (const ad of relatedAds) collectUrls(ad.creative, urls)
        const clickToWhatsApp = relatedAdSets.some(adSet =>
          /WHATSAPP/i.test(adSet.destination_type || "") ||
          Object.keys(adSet.promoted_object || {}).some(key => /whatsapp/i.test(key)),
        ) || [...urls].some(link => /wa\.me|whatsapp\.com/i.test(link))
        const websiteUrls = [...urls].filter(link => !/wa\.me|whatsapp\.com/i.test(link))
        const metric = metrics.get(campaign.id)
        return {
          ...campaign,
          campaignType: clickToWhatsApp ? "CTWA" : websiteUrls.length ? "WEBSITE" : "OTHER",
          websiteUrls,
          deliveryStatus: campaign.effective_status || campaign.status || "UNKNOWN",
          metrics: { impressions: Number(metric?.impressions || 0), clicks: Number(metric?.clicks || 0), spend: metric?.spend || "0" },
        }
      })
      pixels = pixelResult.data
    }

    let leads: MetaLead[] = []
    if (requestedFormId) {
      const form = leadAssets.forms.find(item => item.id === requestedFormId)
      if (!form) return NextResponse.json({ error: "That Lead Form is not accessible to this Meta account." }, { status: 403 })
      const leadResult = await metaGraph<Edge<MetaLead>>(
        `${form.id}/leads?fields=id,created_time,ad_id,campaign_id,field_data&limit=100`, form.pageAccessToken,
      )
      leads = leadResult.data
    }

    return NextResponse.json({
      adAccounts: accounts.map(({ id, name, account_status, currency, timezone_name }) => ({ id, name, account_status, currency, timezone_name })),
      selectedAdAccountId: adAccount?.id || "",
      campaigns,
      pixels,
      pages: leadAssets.pages.map(({ id, name }) => ({ id, name })),
      leadForms: leadAssets.forms.map(({ id, name, status, leads_count, pageId, pageName }) => ({ id, name, status, leads_count, pageId, pageName })),
      leadFormWarnings: leadAssets.errors,
      selectedFormId: requestedFormId,
      leads: leads.map(lead => ({ id: lead.id, created_time: lead.created_time, campaign_id: lead.campaign_id, fields: fieldsRecord(lead.field_data) })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Meta Ads data."
    const status = /sign in/i.test(message) ? 401 : /connect your meta/i.test(message) ? 409 : 502
    return NextResponse.json({ error: message }, { status })
  }
}

const importSchema = z.object({ formId: z.string().regex(/^\d{5,30}$/) })

export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error: "Connect your Meta account first." }, { status: 409 })
    const { formId } = importSchema.parse(await request.json())
    const form = await getSelectedForm(accessToken, formId)
    const result = await metaGraph<Edge<MetaLead>>(
      `${form.id}/leads?fields=id,created_time,ad_id,campaign_id,field_data&limit=100`, form.pageAccessToken,
    )

    let imported = 0
    let skipped = 0
    for (const lead of result.data) {
      const fields = fieldsRecord(lead.field_data)
      const phone = fields.phone_number || fields.phone || fields.mobile_number || fields.mobile || ""
      if (!phone) { skipped++; continue }
      const fullName = fields.full_name || fields.name || [fields.first_name, fields.last_name].filter(Boolean).join(" ") || null
      await prisma.contact.upsert({
        where: { organizationId_phone: { organizationId, phone } },
        create: {
          organizationId, phone, name: fullName, email: fields.email || null,
          source: "META_LEAD_FORM", tags: ["meta-lead-form"], optedIn: false,
          metadata: { metaLeadId: lead.id, formId, adId: lead.ad_id || null, campaignId: lead.campaign_id || null,
            createdTime: lead.created_time || null, leadFields: fields },
        },
        update: {
          name: fullName, email: fields.email || null, source: "META_LEAD_FORM",
          metadata: { metaLeadId: lead.id, formId, adId: lead.ad_id || null, campaignId: lead.campaign_id || null,
            createdTime: lead.created_time || null, leadFields: fields },
        },
      })
      imported++
    }

    return NextResponse.json({ ok: true, imported, skipped, total: result.data.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import Lead Form contacts." }, { status: 400 })
  }
}