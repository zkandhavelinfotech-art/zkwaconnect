import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken, getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

type Phone = {
  id: string
  display_phone_number: string
  verified_name?: string
  code_verification_status?: string
  quality_rating?: string
}

export async function GET() {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error: "Connect your Meta account first." }, { status: 409 })
    const waba = await prisma.waba.findFirst({ where: { organizationId, status: "CONNECTED" } })
    if (!waba) return NextResponse.json({ error: "Select a WhatsApp Business Account first." }, { status: 409 })

    const [phones, savedPhones] = await Promise.all([
      metaGraph<{ data: Phone[] }>(`${waba.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating&limit=100`, accessToken),
      prisma.phoneNumber.findMany({ where: { wabaId: waba.id } }),
    ])
    return NextResponse.json({ waba: { id: waba.wabaId, name: waba.name }, phones: phones.data, savedPhones })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load phone numbers." }, { status: 502 })
  }
}