import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getAdminSession } from "@/lib/auth/admin"
import { metaGraph } from "@/lib/meta/graph"
import { subscribeWaba } from "@/lib/meta/waba"
import { recordLifecycleLog } from "@/lib/whatsapp/lifecycle"
import { getMetaAccessToken } from "@/lib/onboarding/context"

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
      include: {
        metaConnections: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
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

    // Attempt registration & webhook subscription if token available
    let registrationMessage = "Assets saved in database."
    const metaAccessToken = await getMetaAccessToken(org.id)
    if (metaAccessToken) {
      try {
        await metaGraph<{ success?: boolean }>(
          `${phone.phoneNumberId}/register`,
          metaAccessToken,
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

      // Auto-subscribe webhooks
      try {
        await subscribeWaba(waba.wabaId, metaAccessToken)
      } catch {}
    }

    // Auto-resolve any open Assisted Onboarding tickets for this tenant
    await prisma.supportTicket.updateMany({
      where: {
        organizationId: org.id,
        subject: { contains: "Onboarding" },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      data: {
        status: "RESOLVED",
        closedAt: new Date(),
        description: `Automated Resolution: Delegated setup completed by Super Admin on ${new Date().toLocaleDateString()}. WABA: ${waba.wabaId}, Phone: ${phone.phoneNumber}`,
      },
    })

    // Write audit log entry
    await recordLifecycleLog({
      organizationId: org.id,
      eventType: "DELEGATED_SETUP_COMPLETED",
      statusTo: "CONNECTED",
      sanitizedMessage: `Super Admin completed delegated setup for WABA ${waba.wabaId} and Phone ${phone.phoneNumber}.`,
    })

    // Dispatch in-app notification to the tenant workspace
    try {
      await prisma.notification.create({
        data: {
          organizationId: org.id,
          type: "WHATSAPP_ACTIVATED",
          title: "WhatsApp Business API Activated",
          message: `Super Admin completed onboarding setup for WhatsApp number ${phone.phoneNumber}. Your WhatsApp Cloud API gateway is now fully active!`,
          metadata: {
            wabaId: waba.wabaId,
            phoneNumber: phone.phoneNumber,
            activatedAt: new Date().toISOString(),
          },
        },
      })
    } catch (notifErr: any) {
      console.warn("[MANUAL_SETUP_NOTIFICATION_NOTE]", notifErr?.message)
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
