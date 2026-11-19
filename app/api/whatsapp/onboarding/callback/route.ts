import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { metaLoginConfig } from "@/lib/meta/config"
import { exchangeCode, saveMetaConnection } from "@/lib/meta/connection"
import { subscribeWaba } from "@/lib/meta/waba"
import { activateWaba } from "@/lib/onboarding/activate-waba"

export const runtime = "nodejs"

const schema = z.object({
  code: z.string().min(10).max(2000).optional(),
  wabaId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
  phoneNumberId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
  sessionId: z.string().optional(),
})

type MetaWaba = {
  id: string
  name: string
  currency?: string
  timezone_id?: string
  owner_business_info?: { id?: string; name?: string }
}

type MetaPhone = {
  id: string
  display_phone_number: string
  verified_name?: string
  code_verification_status?: string
  quality_rating?: string
}

// POST /api/whatsapp/onboarding/callback
// Handles completed Embedded Signup v4 callback, exchanges credentials, provisions WABA & Phone ID.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in to continue." }, { status: 401 })
    }

    if (!metaLoginConfig().ready) {
      return NextResponse.json({ error: "Facebook Login is not configured on this server." }, { status: 409 })
    }

    const input = schema.parse(await request.json())

    // 1. Token Exchange if auth code provided
    let accessToken: string | null = null
    if (input.code) {
      const token = await exchangeCode(input.code)
      await saveMetaConnection(organizationId, token)
      accessToken = token.accessToken
    } else {
      // Find active meta connection
      const conn = await prisma.metaConnection.findFirst({
        where: { organizationId, status: "CONNECTED" },
        orderBy: { updatedAt: "desc" },
      })
      accessToken = conn?.accessToken || null
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "No active Meta authorization token found. Please restart Facebook login.", status: "ACTION_REQUIRED" },
        { status: 400 }
      )
    }

    // 2. Fallback when popup didn't return WABA ID (requires manual selection)
    if (!input.wabaId) {
      return NextResponse.json({
        ok: true,
        status: "WABA_CREATION_PENDING",
        redirect: "/app/settings",
        message: "Meta authorization successful. Please select your WhatsApp account.",
      })
    }

    // 3. Retrieve WABA details from Meta Graph API
    const waba = await metaGraph<MetaWaba>(
      `${input.wabaId}?fields=id,name,currency,timezone_id,owner_business_info`,
      accessToken
    )

    // Ensure WABA is not hijacked across organizations
    const existing = await prisma.waba.findUnique({ where: { wabaId: waba.id } })
    if (existing && existing.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "This WhatsApp Business Account is already linked to another ZKWAConnect workspace.", status: "FAILED" },
        { status: 409 }
      )
    }

    // Activate WABA against tenant
    await activateWaba({
      organizationId,
      businessId: waba.owner_business_info?.id || null,
      waba,
    })

    const warnings: string[] = []

    // 4. Subscribe to Webhook events
    try {
      await subscribeWaba(waba.id, accessToken)
    } catch (err: any) {
      warnings.push(`Webhook subscription pending (${err?.message || "retry in settings"}).`)
    }

    // 5. Retrieve and Register Phone Number
    let phoneRecord: MetaPhone | null = null
    let registeredSuccess = false

    if (input.phoneNumberId) {
      try {
        phoneRecord = await metaGraph<MetaPhone>(
          `${input.phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`,
          accessToken
        )

        if (phoneRecord) {
          const savedWaba = await prisma.waba.findUniqueOrThrow({ where: { wabaId: waba.id } })

          // Attempt Cloud API 2-step phone registration with 6-digit PIN if needed
          try {
            await metaGraph<{ success?: boolean }>(
              `${phoneRecord.id}/register`,
              accessToken,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  pin: "123456", // standard activation PIN
                }),
              }
            )
            registeredSuccess = true
          } catch {
            // Already registered or PIN set
            registeredSuccess = phoneRecord.code_verification_status === "VERIFIED"
          }

          const phoneStatus = registeredSuccess ? "CONNECTED" : "PENDING"
          const verificationStatus = phoneRecord.code_verification_status === "VERIFIED" ? "VERIFIED" : "CODE_VERIFIED"

          await prisma.phoneNumber.upsert({
            where: { phoneNumberId: phoneRecord.id },
            create: {
              wabaId: savedWaba.id,
              phoneNumberId: phoneRecord.id,
              phoneNumber: phoneRecord.display_phone_number,
              displayName: phoneRecord.verified_name || waba.name,
              status: phoneStatus,
              verificationStatus,
              qualityRating: phoneRecord.quality_rating || "UNKNOWN",
            },
            update: {
              phoneNumber: phoneRecord.display_phone_number,
              displayName: phoneRecord.verified_name || waba.name,
              status: phoneStatus,
              verificationStatus,
              qualityRating: phoneRecord.quality_rating || "UNKNOWN",
            },
          })

          if (registeredSuccess) {
            await prisma.onboarding.updateMany({
              where: { organizationId },
              data: {
                phoneRegistered: true,
                phoneVerified: true,
                currentStep: "COMPLETED",
                status: "COMPLETED",
                completedAt: new Date(),
              },
            })
          }
        }
      } catch (err: any) {
        warnings.push(`Phone number sync note: ${err?.message || "requires manual registration PIN"}`)
      }
    }

    const finalStatus = registeredSuccess ? "CONNECTED" : "REGISTRATION_PENDING"

    return NextResponse.json({
      ok: true,
      status: finalStatus,
      waba: {
        id: waba.id,
        name: waba.name,
        businessId: waba.owner_business_info?.id || null,
        businessName: waba.owner_business_info?.name || null,
      },
      phone: phoneRecord
        ? {
            id: phoneRecord.id,
            phoneNumber: phoneRecord.display_phone_number,
            displayName: phoneRecord.verified_name || waba.name,
            registered: registeredSuccess,
            qualityRating: phoneRecord.quality_rating || "PENDING",
          }
        : null,
      warnings,
      message: registeredSuccess
        ? `WhatsApp Number ${phoneRecord?.display_phone_number || ""} is fully connected and ready to send messages!`
        : "WABA connected. Phone registration pending.",
    })
  } catch (error: any) {
    console.error("[WHATSAPP_ONBOARDING_CALLBACK_ERROR]", error)
    return NextResponse.json(
      { error: error?.message || "Failed to process onboarding callback.", status: "FAILED" },
      { status: 500 }
    )
  }
}
