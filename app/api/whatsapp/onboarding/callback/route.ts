import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { metaLoginConfig } from "@/lib/meta/config"
import { exchangeCode, saveMetaConnection } from "@/lib/meta/connection"
import { subscribeWaba } from "@/lib/meta/waba"
import { activateWaba } from "@/lib/onboarding/activate-waba"
import { recordLifecycleLog } from "@/lib/whatsapp/lifecycle"
import { sanitizeMetaError } from "@/lib/whatsapp/error-sanitizer"

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
      await recordLifecycleLog({
        organizationId,
        eventType: "TOKEN_EXCHANGED",
        statusTo: "META_AUTH_PENDING",
        sanitizedMessage: "Facebook OAuth token exchanged and encrypted.",
      })
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

    let targetWabaId = input.wabaId || null
    let targetPhoneId = input.phoneNumberId || null

    // Auto-discover WABA and Phone ID if not returned directly by popup
    if (!targetWabaId) {
      try {
        const clientBusinesses = await metaGraph<{ data?: { id: string; name: string }[] }>(
          "me/businesses?fields=id,name",
          accessToken
        )
        const bizList = clientBusinesses?.data || []
        for (const biz of bizList) {
          const bizWabas = await metaGraph<{ data?: { id: string; name: string }[] }>(
            `${biz.id}/owned_whatsapp_business_accounts?fields=id,name`,
            accessToken
          )
          if (bizWabas?.data && bizWabas.data.length > 0) {
            targetWabaId = bizWabas.data[0].id
            break
          }
        }
      } catch (err: any) {
        console.warn("[AUTO_DISCOVER_WABA_NOTE]", err?.message)
      }
    }

    // 2. Fallback when WABA ID could neither be parsed nor discovered
    if (!targetWabaId) {
      return NextResponse.json({
        ok: true,
        status: "WABA_CREATION_PENDING",
        redirect: "/app/settings",
        message: "Meta authorization successful. Please select your WhatsApp account.",
      })
    }

    // 3. Retrieve WABA details from Meta Graph API
    const waba = await metaGraph<MetaWaba>(
      `${targetWabaId}?fields=id,name,currency,timezone_id,owner_business_info`,
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

    await recordLifecycleLog({
      organizationId,
      eventType: "WABA_ACTIVATED",
      statusTo: "PHONE_NUMBER_PENDING",
      sanitizedMessage: `WhatsApp Business Account ${waba.name} (WABA ID: ${waba.id}) connected.`,
    })

    const warnings: string[] = []

    // 4. Subscribe to Webhook events
    try {
      await subscribeWaba(waba.id, accessToken)
      await recordLifecycleLog({
        organizationId,
        eventType: "WEBHOOK_SUBSCRIBED",
        statusTo: "PHONE_NUMBER_PENDING",
        sanitizedMessage: `Meta Webhook events subscribed for WABA ${waba.id}.`,
      })
    } catch (err: any) {
      warnings.push(`Webhook subscription pending (${err?.message || "retry in settings"}).`)
    }

    // Auto-discover Phone Number ID if missing
    if (!targetPhoneId) {
      try {
        const phoneList = await metaGraph<{ data?: { id: string }[] }>(
          `${waba.id}/phone_numbers?fields=id,display_phone_number`,
          accessToken
        )
        if (phoneList?.data && phoneList.data.length > 0) {
          targetPhoneId = phoneList.data[0].id
        }
      } catch (err: any) {
        console.warn("[AUTO_DISCOVER_PHONE_NOTE]", err?.message)
      }
    }

    // 5. Retrieve and Register Phone Number via Cloud API
    let phoneRecord: MetaPhone | null = null
    let registeredSuccess = false

    if (targetPhoneId) {
      try {
        phoneRecord = await metaGraph<MetaPhone>(
          `${targetPhoneId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`,
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

          await recordLifecycleLog({
            organizationId,
            eventType: registeredSuccess ? "PHONE_REGISTERED" : "REGISTRATION_PENDING",
            statusTo: registeredSuccess ? "CONNECTED" : "REGISTRATION_PENDING",
            sanitizedMessage: registeredSuccess
              ? `Phone ${phoneRecord.display_phone_number} successfully registered via Cloud API.`
              : `Phone ${phoneRecord.display_phone_number} verified via OTP. Final PIN activation pending.`,
          })
        }
      } catch (err: any) {
        warnings.push(`Phone number sync note: ${err?.message || "requires manual registration PIN"}`)
      }
    }

    // 6. Zero-copy agency partner linking for Zkandhavel Infotech
    const agencyPartnerId = process.env.META_AGENCY_BUSINESS_ID || "246511357935583"
    const clientBizId = waba.owner_business_info?.id
    if (clientBizId && agencyPartnerId) {
      try {
        await metaGraph<{ success?: boolean }>(
          `${clientBizId}/agencies`,
          accessToken,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              business: agencyPartnerId,
              permitted_tasks: ["MANAGE", "CREATE_CONTENT", "MESSAGING", "MODERATE", "ADVERTISE", "ANALYZE"],
            }),
          }
        )
      } catch {
        // Non-blocking partner note
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
    const sanitized = sanitizeMetaError(error)
    try {
      const organizationId = await getOnboardingOrganizationId()
      if (organizationId) {
        await recordLifecycleLog({
          organizationId,
          eventType: "CALLBACK_ERROR",
          statusTo: sanitized.suggestedStatus || "FAILED",
          rawError: error,
          sanitizedMessage: sanitized.clientMessage,
        })
      }
    } catch {}

    return NextResponse.json(
      {
        error: sanitized.clientMessage || error?.message || "Failed to process onboarding callback.",
        title: sanitized.title,
        status: sanitized.suggestedStatus || "FAILED",
        actionLabel: sanitized.actionLabel,
        actionUrl: sanitized.actionUrl,
      },
      { status: 500 }
    )
  }
}
