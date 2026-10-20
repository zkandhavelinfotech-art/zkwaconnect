import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

type PhoneInfo = { verified_name?: string; name_status?: string; quality_rating?: string; display_phone_number?: string; messaging_limit_tier?: string
  is_official_business_account?: boolean; code_verification_status?: string }

// Green tick (Official Business Account): eligibility checks and the request to Meta.
export async function GET() {
  try {
    const { organizationId } = await requireMember()
    const token = await getMetaAccessToken(organizationId)
    if (!token) return NextResponse.json({ error: "Connect Facebook first (Meta Account)." }, { status: 409 })
    const [phones, connection] = await Promise.all([
      prisma.phoneNumber.findMany({ where: { status: "CONNECTED", waba: { organizationId } }, select: { id: true, phoneNumberId: true, phoneNumber: true, displayName: true } }),
      prisma.metaConnection.findFirst({ where: { organizationId, status: "CONNECTED" }, orderBy: { updatedAt: "desc" }, select: { businessManagerId: true } }),
    ])
    const business = connection?.businessManagerId
      ? await metaGraph<{ name?: string; verification_status?: string }>(`${connection.businessManagerId}?fields=name,verification_status`, token).catch(error => ({ error: (error as Error).message }))
      : { error: "No Business Manager found for this connection." }
    const numbers = await Promise.all(phones.map(async phone => {
      const info = await metaGraph<PhoneInfo>(`${phone.phoneNumberId}?fields=verified_name,name_status,quality_rating,display_phone_number,messaging_limit_tier,is_official_business_account,code_verification_status`, token)
        .catch(error => ({ error: (error as Error).message } as PhoneInfo & { error: string }))
      const oba = await metaGraph<{ official_business_account?: { oba_status?: string; status_message?: string } }>(`${phone.phoneNumberId}?fields=official_business_account`, token)
        .then(result => result.official_business_account || null).catch(() => null)
      return { id: phone.id, phoneNumber: phone.phoneNumber, displayName: phone.displayName, info, oba }
    }))
    return NextResponse.json({ business, numbers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) })
  }
}

const schema = z.object({
  phoneId: z.string().min(1),
  website: z.string().trim().url("Enter your business website (https://…)."),
  country: z.string().trim().min(2).max(60),
  language: z.string().trim().min(2).max(40),
  parentBrand: z.string().trim().max(120).optional(),
  supportingLinks: z.array(z.string().trim().url()).min(1, "Add at least one link to a news article or press coverage about your business.").max(5),
  additionalInfo: z.string().trim().max(1000).optional(),
})

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const input = schema.parse(await request.json())
    const phone = await prisma.phoneNumber.findFirst({ where: { id: input.phoneId, waba: { organizationId } } })
    if (!phone) return NextResponse.json({ error: "Phone number not found." }, { status: 404 })
    const token = await getMetaAccessToken(organizationId)
    if (!token) return NextResponse.json({ error: "Connect Facebook first." }, { status: 409 })
    await metaGraph(`${phone.phoneNumberId}/official_business_account`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      business_website_url: input.website, primary_country_of_operation: input.country, primary_language: input.language,
      supporting_links: input.supportingLinks, ...(input.parentBrand ? { parent_business_or_brand: input.parentBrand } : {}),
      ...(input.additionalInfo ? { additional_supporting_information: input.additionalInfo } : {}) }) })
    return NextResponse.json({ ok: true, message: "Request sent to Meta. Reviews usually take a few days; the status updates here." })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed"
    return NextResponse.json({ error: message }, { status: errorStatus(error) })
  }
}
