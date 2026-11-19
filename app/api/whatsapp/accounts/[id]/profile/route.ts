import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { VERTICAL_KEYS } from "@/lib/meta/profile"

export const runtime = "nodejs"

const updateSchema = z.object({
  about: z.string().max(139).optional(),
  address: z.string().max(256).optional(),
  description: z.string().max(512).optional(),
  email: z.string().email().or(z.literal("")).optional(),
  websites: z.array(z.string().url().or(z.literal(""))).max(2).optional(),
  vertical: z.enum(VERTICAL_KEYS as [string, ...string[]]).optional(),
})

// GET /api/whatsapp/accounts/[id]/profile
// Fetches official WhatsApp Business Profile details from Meta Graph API.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { id } = await params

    const phone = await prisma.phoneNumber.findFirst({
      where: {
        OR: [{ id }, { phoneNumberId: id }],
        waba: { organizationId },
      },
    })

    if (!phone) {
      return NextResponse.json({ error: "Phone number not found." }, { status: 404 })
    }

    const conn = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    })

    if (!conn?.accessToken) {
      return NextResponse.json({ error: "No active Meta authorization token." }, { status: 400 })
    }

    const res = await metaGraph<{ data?: any[] }>(
      `${phone.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      conn.accessToken
    )

    const profile = res?.data?.[0] || {}

    return NextResponse.json({
      ok: true,
      phoneNumberId: phone.phoneNumberId,
      phoneNumber: phone.phoneNumber,
      profile: {
        about: profile.about || "",
        address: profile.address || "",
        description: profile.description || "",
        email: profile.email || "",
        profilePictureUrl: profile.profile_picture_url || null,
        websites: profile.websites || [],
        vertical: profile.vertical || "OTHER",
      },
    })
  } catch (error: any) {
    console.error("[WHATSAPP_GET_PROFILE_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Could not fetch profile." }, { status: 500 })
  }
}

// POST /api/whatsapp/accounts/[id]/profile
// Updates official WhatsApp Business Profile details directly on Meta Cloud API.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const input = updateSchema.parse(body)

    const phone = await prisma.phoneNumber.findFirst({
      where: {
        OR: [{ id }, { phoneNumberId: id }],
        waba: { organizationId },
      },
    })

    if (!phone) {
      return NextResponse.json({ error: "Phone number not found." }, { status: 404 })
    }

    const conn = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    })

    if (!conn?.accessToken) {
      return NextResponse.json({ error: "No active Meta token found." }, { status: 400 })
    }

    const payload: Record<string, any> = {
      messaging_product: "whatsapp",
    }
    if (input.about !== undefined) payload.about = input.about
    if (input.address !== undefined) payload.address = input.address
    if (input.description !== undefined) payload.description = input.description
    if (input.email !== undefined) payload.email = input.email
    if (input.vertical !== undefined) payload.vertical = input.vertical
    if (input.websites !== undefined) payload.websites = input.websites.filter(Boolean)

    await metaGraph<{ success?: boolean }>(
      `${phone.phoneNumberId}/whatsapp_business_profile`,
      conn.accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )

    return NextResponse.json({
      ok: true,
      message: "✓ WhatsApp Business Profile updated successfully on Meta!",
      profile: payload,
    })
  } catch (error: any) {
    console.error("[WHATSAPP_UPDATE_PROFILE_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to update profile on Meta." }, { status: 500 })
  }
}
