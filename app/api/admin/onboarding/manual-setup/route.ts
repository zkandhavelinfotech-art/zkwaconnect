import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getAdminSession } from "@/lib/auth/admin"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

const schema = z.object({
  organizationId: z.string().min(1),
  wabaId: z.string().regex(/^\d{5,30}$/),
  phoneNumberId: z.string().regex(/^\d{5,30}$/),
  phoneNumber: z.string().min(8),
  displayName: z.string().optional(),
  pin: z.string().regex(/^\d{6}$/).default("123456"),
})

// POST /api/admin/onboarding/manual-setup
// Super Admin delegated onboarding: sets up WABA and Phone assets on behalf of a tenant.
export async function POST(request: Request) {
  try {
    const admin = await getAdminSession()
    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 })
    }

    const body = await request.json()
    const input = schema.parse(body)

    const org = await prisma.organization.findUnique({
      where: { id: input.organizationId },
      include: { metaConnection: true },
    })

    if (!org) {
      return NextResponse.json({ error: "Customer organization not found." }, { status: 404 })
    }

    // Upsert WABA against tenant
    const waba = await prisma.waba.upsert({
      where: { wabaId: input.wabaId },
      create: {
        organizationId: org.id,
        wabaId: input.wabaId,
        name: input.displayName || `${org.name} WhatsApp`,
        status: "CONNECTED",
      },
      update: {
        organizationId: org.id,
        name: input.displayName || `${org.name} WhatsApp`,
        status: "CONNECTED",
      },
    })

    // Upsert Phone Number
    const phone = await prisma.phoneNumber.upsert({
      where: { phoneNumberId: input.phoneNumberId },
      create: {
        wabaId: waba.id,
        phoneNumberId: input.phoneNumberId,
        phoneNumber: input.phoneNumber,
        displayName: input.displayName || org.name,
        status: "CONNECTED",
        verificationStatus: "VERIFIED",
      },
      update: {
        wabaId: waba.id,
        phoneNumber: input.phoneNumber,
        displayName: input.displayName || org.name,
        status: "CONNECTED",
        verificationStatus: "VERIFIED",
      },
    })

    // Update Onboarding Record
    await prisma.onboarding.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        metaConnected: true,
        wabaCreated: true,
        phoneRegistered: true,
        phoneVerified: true,
        currentStep: "COMPLETED",
        status: "COMPLETED",
        completedAt: new Date(),
      },
      update: {
        metaConnected: true,
        wabaCreated: true,
        phoneRegistered: true,
        phoneVerified: true,
        currentStep: "COMPLETED",
        status: "COMPLETED",
        completedAt: new Date(),
      },
    })

    // Attempt registration if token available
    let registrationMessage = "Assets saved in database."
    if (org.metaConnection?.accessToken) {
      try {
        await metaGraph<{ success?: boolean }>(
          `${phone.phoneNumberId}/register`,
          org.metaConnection.accessToken,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              pin: input.pin,
            }),
          }
        )
        registrationMessage = "Registered with Meta Cloud API and 6-digit PIN provisioned!"
      } catch (err: any) {
        registrationMessage = `Assets saved. Cloud API registration note: ${err.message}`
      }
    }

    return NextResponse.json({
      ok: true,
      status: "CONNECTED",
      wabaId: waba.wabaId,
      phoneNumber: phone.phoneNumber,
      message: `Tenant ${org.name} successfully onboarded! ${registrationMessage}`,
    })
  } catch (error: any) {
    console.error("[ADMIN_MANUAL_SETUP_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to complete manual onboarding." }, { status: 500 })
  }
}
